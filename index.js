#!/usr/bin/env node
const { createCanvas, loadImage } = require('canvas')
const fs = require('fs')
const GIFEncoder = require('gifencoder')
const minimist = require('minimist')
const RgbQuant = require('rgbquant')

const palettes = require('./palettes.js')

const args = minimist(process.argv.slice(2))

const usage = `Usage: dither --palette="#aaaaaa,#bbbbbb,#cccccc" -i <input> -o <output>

--palette        Comma separated list of hex colors for palette
--serpentine     Enable/disable serpentine dithering
--silent         Don't output status messages
-i               Input filename
-l               List available presets
-o               Output filename
-p / --preset    Name of preset palette
-s / --scale     Scale the image to this max width or height
-v               Verbose

`

let silent = false

if (args.l) {
  listPresets()
} else if (args.i) {
  dither()
} else {
  status(usage)
}

function dither() {
  silent = args.silent || false
  
  const rgbQuantOptions = {
    boxPxls: 2,
    boxSize: [8, 8],
    cacheFreq: 10,
    colorDist: 'euclidean',
    colors: 8,
    dithDelta: 0,
    dithKern: 'FloydSteinberg',
    dithSerp: false,
    initColors: 4096,
    method: 2,
    minHueCols: 2000,
    palette: [],
    reIndex: false,
    useCache: true,
  }

  const presetName = args.preset || args.p
  if (presetName) {
    const preset = palettes[presetName]
    if (!preset) {
      status(`Unknown preset: ${presetName}`)
      listPresets()
      return
    }
  }

  const palette = 
    (args.palette && args.palette.split(',')) ?? 
    (presetName && palettes[presetName]) ??
    []

  let inputPath = args.i || ''

  if (inputPath.length) {
    status('Dithering: ' + inputPath)
    let inputStats
    try {
      inputStats = fs.statSync(inputPath)
      status('Input size: ' + formatBytes(inputStats.size))
    } catch (err) {
      status('Could not read file: ' + inputPath)
      return
    }
    loadImage(inputPath).then((image) => {
      const scale = args.s || args.scale
      const modifiedWidth = (scale || image.width) 
      const modifiedHeight = (scale || image.height)
      const ratio = Math.min(modifiedWidth / image.width, modifiedHeight / image.height)
      const width = image.width * ratio
      const height = image.height * ratio
      const canvas = createCanvas(width, height)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(image, 0, 0, width, height)

      const quant = new RgbQuant({
        ...rgbQuantOptions, 
        dithSerp: args.serpentine || false,
        palette: palette.map((color) => hexToRgb(color))
      })
      quant.sample(canvas)
      const reducedPalette = quant.palette(true)
      const ditherResult = quant.reduce(canvas)

      const imgData = ctx.getImageData(0, 0, width, height)
      imgData.data.set(ditherResult) 
      ctx.putImageData(imgData, 0, 0)

      const outputPath = args.o || inputPath + '-dither.gif'
      
      // Convert to GIF
      const encoder = new GIFEncoder(width, height)
      encoder.createReadStream().pipe(fs.createWriteStream(outputPath))

      encoder.start()
      encoder.setRepeat(0)   // 0 for repeat, -1 for no-repeat
      encoder.setDelay(500)  // frame delay in ms
      encoder.setQuality(10) // image quality. 10 is default.

      encoder.addFrame(ctx)
      encoder.finish()

      setTimeout(() => {
        // Output stats
        try {
          const outputStats = fs.statSync(outputPath)
          status('Output size: ' + formatBytes(outputStats.size))
          status('Percentage reduction: ' + (100 - (inputStats.size / outputStats.size)).toFixed(2) + '%')
        } catch (err) {
          status('Could not read file:' + outputPath)
        }
        status('Final palette: ' + paletteToHex(reducedPalette).join(','))
        status('Dithered: ' + outputPath)
      }, 1000)
    })
  }
}

function listPresets() {
  status('Available presets:')
  Object.keys(palettes).forEach((name) => {
    status(`  ${name}`)
    if (args.v) {
      status(`  ${palettes[name].join(', ')}\n`)
    }
  })
}

function paletteToHex (palette) {
  return palette.map((color) => {
    return rgbToHex(color)
  })
}

function rgbToHex(rgb) {
  return '#' + rgb.map((x) => {           
    x = parseInt(x).toString(16)
    return (x.length == 1) ? '0' + x : x
  }).join('')
}

function hexToRgb(hex) {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
      ]
    : null
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

function status(text) {
  if (!silent) {
    console.log(text)
  }
}