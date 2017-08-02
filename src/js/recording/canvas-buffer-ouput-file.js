const fs = require('fs')
const path = require('path')
const { fork } = require('child_process');
const forked = fork(__dirname+'/../files/forked-file-writer.js')

class CanvasBufferOutputFileStrategy {
  constructor(options) {
    this.exportsPath = options.exportsPath
  }

  flush(buffer, pool) {
    let i = 0;
    while(buffer.length) {
      let bufferData = buffer.splice(0, 1)[0]
      let filepath = path.join(this.exportsPath, `recording-${bufferData.metaData.frameNum}.png`)
      let imageData = bufferData.canvas
        .toDataURL('image/png')
        .replace(/^data:image\/\w+;base64,/, '')
      forked.send({ file: filepath, data: imageData, options:'base64' })
      if(pool) {
        pool.push(bufferData.canvas)
      }
    }
  }
}

module.exports = CanvasBufferOutputFileStrategy