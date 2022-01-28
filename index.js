#!/usr/bin/env node
const { createCanvas, loadImage } = require('canvas')
const fs = require('fs')
const minimist = require('minimist')
const RgbQuant = require('rgbquant')

const palettes = require('./palettes.js')

const args = minimist(process.argv.slice(2))

const usage = `Usage: dither --palette="#aaaaaa,#bbbbbb,#cccccc" -i <input> -o <output>

--palette      Comma separated list of hex colors for palette
--preset       Name of preset palette
--serpentine   Enable/disable serpentine dithering
-i             Input filename
-l             List available presets
-o             Output filename
-s --scale     Scale the image to this max width or height
-v             Verbose

`

if (args.l) {
  console.log('Available presets:')
  Object.keys(palettes).forEach((name) => {
    console.log(`  ${name}`)
    if (args.v) {
      console.log(`  ${palettes[name].join(', ')}\n`)
    }
  })
} else if (args.i) {
  dither()
} else {
  console.log(usage)
}

function dither() {
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

  if (args.preset) {
    const preset = palettes[args.preset]
    if (!preset) {
      console.log(`Unknown preset: ${args.preset}`)
      console.log('Available presets:')
      Object.keys(palettes).forEach((name) => {
        console.log(`  ${name}`)
      })
      return
    }
  }

  const palette = 
    (args.palette && args.palette.split(',')) ?? 
    (args.preset && palettes[args.preset]) ??
    []

  let inputPath = args.i || ''

  if (inputPath.length) {
    console.log('Dithering: ' + inputPath)
    try {
      const inputStats = fs.statSync(inputPath)
      console.log('Input size: ' + formatBytes(inputStats.size))
    } catch (err) {
      console.log('Could not read file:' + inputPath)
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

      const outputPath = args.o || inputPath + '-dither.png'
      fs.writeFileSync(outputPath, canvas.toBuffer())
      try {
        const inputStats = fs.statSync(outputPath)
        console.log('Output size: ' + formatBytes(inputStats.size))
      } catch (err) {
        console.log('Could not read file:' + outputPath)
      }
      console.log('Palette: ', paletteToHex(reducedPalette).join(','))
      console.log('Dithered: ' + outputPath)
    })
  }
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
