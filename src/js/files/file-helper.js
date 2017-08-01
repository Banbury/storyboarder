const path = require('path')
const fs = require('fs')
const readPsd = require('ag-psd').readPsd;
const initializeCanvas = require('ag-psd').initializeCanvas;

/**
 * Retrieve an ojbect with base 64 representations of an image file ready for storyboard pane layers.
 *  
 * @param {string} filepath 
 * @param {Object} options
 * @returns {Object} An object with data for notes (optional), reference (optional), and main
 */
let getBase64ImageDataFromFilePath = (filepath, options={importTargetLayer:"reference"}) => {
  let {importTargetLayer} = options
  let arr = filepath.split(path.sep)
  let filename = arr[arr.length-1]
  let filenameParts =filename.toLowerCase().split('.')
  let type = filenameParts[filenameParts.length-1]

  let result = {}
  switch(type) {
    case "png":
      result[importTargetLayer] = getBase64TypeFromFilePath('png', filepath)
      break
    case "jpg":
      result[importTargetLayer] = getBase64TypeFromFilePath('jpg', filepath)
      break
    case "psd":
      result = getBase64TypeFromPhotoshopFilePath(filepath, options)
      break
  }
  return result
}

let getBase64TypeFromFilePath = (type, filepath) => {
  if (!fs.existsSync(filepath)) return null

  // via https://gist.github.com/mklabs/1260228/71d62802f82e5ac0bd97fcbd54b1214f501f7e77
  let data = fs.readFileSync(filepath).toString('base64')
  return `data:image/${type};base64,${data}`
}

let getBase64TypeFromPhotoshopFilePath = (filepath, options) => {
  if (!fs.existsSync(filepath)) return null

  initializeCanvas((width, height) => {
        let canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        return canvas;
      });
  
  let psd
  try {
    const buffer = fs.readFileSync(filepath)
    psd = readPsd(buffer)
  } catch(exception) {
    console.error(exception)
    return null
  }
  
  if(!psd || !psd.children) {
    return;
  }
  let mainCanvas = options.mainCanvas 
  if(!mainCanvas) {
    mainCanvas = document.createElement('canvas')
    mainCanvas.width = psd.width
    mainCanvas.height = psd.height
  }
  let mainContext = mainCanvas.getContext('2d');
  mainContext.clearRect(0, 0, mainCanvas.width, mainCanvas.height)

  let notesCanvas = options.notesCanvas
  if(!notesCanvas) {
    notesCanvas = document.createElement('canvas')
    notesCanvas.width = psd.width
    notesCanvas.height = psd.height
  }
  let notesContext = notesCanvas.getContext('2d');
  notesContext.clearRect(0, 0, notesCanvas.width, notesCanvas.height)

  let referenceCanvas = options.referenceCanvas
  if(!referenceCanvas) {
    referenceCanvas = document.createElement('canvas')
    referenceCanvas.width = psd.width
    referenceCanvas.height = psd.height
  }
  let referenceContext = referenceCanvas.getContext('2d')
  referenceContext.clearRect(0, 0, referenceCanvas.width, referenceCanvas.height)

  let numChannelValues = (1 << psd.bitsPerChannel) - 1
  let targetContext
  for(let layer of psd.children) {
    if(!layer.canvas) {
      continue;
    }
    if(layer.hidden) {
      continue;
    }
    if(layer.name.indexOf('Background') >= 0) {
      continue
    }
    let targetContext
    switch(layer.name) {
      case "notes":
        targetContext = notesContext
        break
      case "reference":
        targetContext = referenceContext
        break
      default:
        targetContext = mainContext
        break
    }
    targetContext.globalAlpha = layer.opacity / numChannelValues
    targetContext.drawImage(layer.canvas, layer.left, layer.top)
  }
  return {
    main: mainCanvas.toDataURL(),
    notes: notesCanvas.toDataURL(),
    reference: referenceCanvas.toDataURL()
  }
}

module.exports = {
  getBase64ImageDataFromFilePath,
  getBase64TypeFromFilePath
}
