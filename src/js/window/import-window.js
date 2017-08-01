const {ipcRenderer, shell, remote} = require('electron')
const prefModule = require('electron').remote.require('./prefs.js')
const pdf = require('pdfjs-dist')
const worksheetPrinter = require('./worksheet-printer.js')
const storyTips = new(require('./story-tips'))
const child_process = require('child_process')
const app = require('electron').remote.app
const os = require('os')
const path = require('path')
const jsfeat = require('../vendor/jsfeat-min.js')
const fs = require('fs')
const QrCode = require('qrcode-reader');

let sourceImage
let flatImage

let cropMarks
let code
let offset = [0,-20]

/*

  todo:
    error if cant get 4 points
    error if cant get qr code
  
    see if we can speed up window open
    disable button on clicking import

    hook up offsets
    hook up crop %
    save to prefs

    dont import blanks

    make work with cell phone capture


*/


document.querySelector('#close-button').onclick = (e) => {
  ipcRenderer.send('playsfx', 'negative')
  let window = remote.getCurrentWindow()
  window.hide()
}

document.querySelector('#import-button').onclick = (e) => {
  ipcRenderer.send('playsfx', 'positive')
  // PRINT
  importImages()

  console.log("HEELLLLOOO")
  // let window = remote.getCurrentWindow()
  // window.hide()
}

const importImages = () => {
  let destCanvas = document.createElement('canvas')
  destCanvas.height = 900
  destCanvas.width = (900*Number(code[5]))
  let images = []
  for (var i = 0; i < cropMarks.length; i++) {
    destCanvas.getContext("2d").drawImage(flatImage, cropMarks[i][0]*flatImage.width+offset[0], cropMarks[i][1]*flatImage.height+offset[1], cropMarks[i][2]*flatImage.width, cropMarks[i][3]*flatImage.height, 0, 0, destCanvas.width, destCanvas.height)
    // imgData = destCanvas.toDataURL().replace(/^data:image\/\w+;base64,/, '')
    // fs.writeFileSync(path.join(app.getPath('temp'), 'crop' + i + '.png'), imgData, 'base64')
    images.push(destCanvas.toDataURL())
  }
  remote.getCurrentWindow().getParentWindow().webContents.send('importFromWorksheet',images)
}



const processWorksheetImage = (imageSrc) => {
  sourceImage = new Image()

  sourceImage.onload = () => {
    console.log("SOURCE IMAGE LOADED!!!!")
    console.log(app.getPath('temp'))
    // STEP
    // create a 1500px wide image to deal with
    let canvas = document.createElement('canvas')
    let imageAspect = sourceImage.width/sourceImage.height
    canvas.width = 1500
    canvas.height = Math.round(1500/imageAspect)
    let context = canvas.getContext('2d')
    context.drawImage(sourceImage, 0,0, canvas.width, canvas.height)
    let imageData = context.getImageData(0, 0, canvas.width, canvas.height)

    // STEP
    // get pixels greyscale from photo
    let img_u8 = new jsfeat.matrix_t(canvas.width, canvas.height, jsfeat.U8C1_t);
    jsfeat.imgproc.grayscale(imageData.data, canvas.width, canvas.height, img_u8);
    imageData = context.getImageData(0, 0, canvas.width, canvas.height)
    outputImage(img_u8, context, path.join(app.getPath('temp'), 'step1.png'))

    // STEP
    // gaussian blur to remove noise and small lines
    var r = 8;
    var kernel_size = (r+1) << 1;
    jsfeat.imgproc.gaussian_blur(img_u8, img_u8, kernel_size, 0);
    outputImage(img_u8, context, path.join(app.getPath('temp'), 'step2.png'))

    // STEP
    // canny edge detection to find lines
    jsfeat.imgproc.canny(img_u8, img_u8, 10, 50);
    outputImage(img_u8, context, path.join(app.getPath('temp'), 'step3.png'))

    // STEP
    // perform hough transform to find all lines greater than 250 strength
    let lines = jsfeat.imgproc.hough_transform(img_u8, 1, Math.PI/500,250)

    // STEP
    // reverse array so strongest results are first
    lines.reverse()

    // STEP
    // add each line candidtate to an array
    let lineCandidates = []
    for (let line of lines) {
      let rho = line[0]
      let theta = line[1]
      let a = Math.cos(theta)
      let b = Math.sin(theta)
      let x0 = a*rho
      let y0 = b*rho
      let x1 = Math.round(x0 + 2000*(-b))
      let y1 = Math.round(y0 + 2000*(a))
      let x2 = Math.round(x0 - 2000*(-b))
      let y2 = Math.round(y0 - 2000*(a))
      context.strokeStyle="#FF0000"
      context.beginPath()
      context.moveTo(x1, y1)
      context.lineTo(x2, y2)
      context.stroke()
      lineCandidates.push([x1, y1, x2, y2, rho, theta])
    }

    // STEP
    // remove lines that are similar angles and very close to each other. keep the most dominant line.
    for (var g = 0; g < 4; g++) {
      var lineCandidatesClone = lineCandidates.slice(0)
      for (var z = 0; z < lineCandidates.length; z++) {
        for (var y = z; y < lineCandidates.length; y++) {
          if (z !== y) {
            let line1 = lineCandidates[z]
            let line2 = lineCandidates[y]
            let anglediff = angleDistance(line1[5],line2[5])
            // distance between midpoint of 2 lines
            let point1 = [((line1[0]+line1[2])/2),((line1[1]+line1[3])/2)]
            let point2 = [((line2[0]+line2[2])/2),((line2[1]+line2[3])/2)]
            let interdiff = distance(point1[0],point1[1],point2[0],point2[1])
            //console.log(anglediff, interdiff)
            if ((anglediff < 0.1) && (interdiff < 30)) {
              if (y > z) {
                lineCandidatesClone.splice(y, 1)
              } else {
                lineCandidatesClone.splice(z, 1)
              }
              //console.log("deleted similar")
            }
          }
        }
      }
      lineCandidates  = lineCandidatesClone
      //console.log("LINES: " + lineCandidates.length)
    }

    // draw line candidates
    for (var z = 0; z < lineCandidates.length; z++) {
      let line = lineCandidates[z]
      if (z < 4) {
        context.strokeStyle="#00FF00"
      } else {
        context.strokeStyle="#0000FF"
      }
      context.beginPath()
      context.moveTo(line[0], line[1])
      context.lineTo(line[2], line[3])
      context.stroke()
    }

    // STEP
    // filter out corner points and add them to an array
    let cornerPoints = []
    if (lineCandidates.length >= 4) {
      for (var z = 0; z < 4; z++) {
        for (var y = z; y < 4; y++) {
          if (z !== y) {
            let line1 = lineCandidates[z]
            let line2 = lineCandidates[y]
            let intersect = checkLineIntersection(line1[0],line1[1],line1[2],line1[3],line2[0],line2[1],line2[2],line2[3])
            if (intersect.x) {
              if (intersect.x > 0 && intersect.y > 0 && intersect.x < context.canvas.width && intersect.y < context.canvas.height) {
                cornerPoints.push([intersect.x/context.canvas.width, intersect.y/context.canvas.height])
                context.fillStyle = 'orange';
                context.fillRect(intersect.x-3, intersect.y-3, 6, 6);
              }
            }
          }
        }
      }
    }
    let imgData = context.canvas.toDataURL().replace(/^data:image\/\w+;base64,/, '')
    fs.writeFileSync(path.join(app.getPath('temp'), 'step4.png'), imgData, 'base64')

    console.log(cornerPoints)

    if (cornerPoints.length !== 4) {
      alert(`Error: I couldn't find 4 corners of the paper in the image.`)
      // should show ui for point corners.
    } else {
      // STEP
      // reorder points in the right order
      cornerPoints.sort((b,a) => {
        console.log((Math.atan2(a[0]-0.5,a[1]-0.5)),(Math.atan2(b[0]-0.5,b[1]-0.5)))
        return (Math.atan2(a[0]-0.5,a[1]-0.5))-(Math.atan2(b[0]-0.5,b[1]-0.5))
      })
      cornerPoints.unshift(cornerPoints.pop())

      console.log(cornerPoints)
      // STEP
      // TODO: check the area, should error if too small or less than 4 points

      // STEP 
      // reverse warp to read qr code
      canvas.width = 2500
      canvas.height = Math.round(2500/(11/8.5))
      context = canvas.getContext('2d')
      context.drawImage(sourceImage, 0,0, canvas.width, canvas.height)
      imageData = context.getImageData(0, 0, canvas.width, canvas.height);


      img_u8 = new jsfeat.matrix_t(canvas.width, canvas.height, jsfeat.U8_t | jsfeat.C1_t);
      // img_u8_warp = new jsfeat.matrix_t(640, 480, jsfeat.U8_t | jsfeat.C1_t);
      img_u8_warp = new jsfeat.matrix_t(canvas.width, canvas.height, jsfeat.U8_t | jsfeat.C1_t);
      transform = new jsfeat.matrix_t(3, 3, jsfeat.F32_t | jsfeat.C1_t);
      jsfeat.math.perspective_4point_transform(transform, 
                                                      cornerPoints[0][0]*canvas.width,   cornerPoints[0][1]*canvas.height,   0,  0,
                                                      cornerPoints[1][0]*canvas.width,   cornerPoints[1][1]*canvas.height,   canvas.width, 0,
                                                      cornerPoints[2][0]*canvas.width,   cornerPoints[2][1]*canvas.height, canvas.width, canvas.height,
                                                      cornerPoints[3][0]*canvas.width,   cornerPoints[3][1]*canvas.height, 0, canvas.height);
      jsfeat.matmath.invert_3x3(transform, transform);

      jsfeat.imgproc.grayscale(imageData.data, canvas.width, canvas.height, img_u8);
      jsfeat.imgproc.warp_perspective(img_u8, img_u8_warp, transform, 0);

      var data_u32 = new Uint32Array(imageData.data.buffer);
      var alpha = (0xff << 24);
      var i = img_u8_warp.cols*img_u8_warp.rows, pix = 0;
      while(--i >= 0) {
        pix = img_u8_warp.data[i];
        data_u32[i] = alpha | (pix << 16) | (pix << 8) | pix;
      }
      context.putImageData(imageData, 0, 0);
      imgData = context.canvas.toDataURL().replace(/^data:image\/\w+;base64,/, '')
      fs.writeFileSync(path.join(app.getPath('temp'), 'step5.png'), imgData, 'base64')

      let qrCanvas = document.createElement('canvas')
      qrCanvas.width = 500
      qrCanvas.height = 500
      let qrContext = qrCanvas.getContext('2d')
      qrContext.drawImage(context.canvas, -context.canvas.width+500,0, context.canvas.width, context.canvas.height)
      let qrImageData = qrContext.getImageData(0, 0, qrCanvas.width, qrCanvas.height)

      var newImageData = contrastImage(qrImageData, 150)
      qrContext.putImageData(newImageData, 0, 0);
      
      imgData = qrContext.canvas.toDataURL().replace(/^data:image\/\w+;base64,/, '')
      fs.writeFileSync(path.join(app.getPath('temp'), 'step6.png'), imgData, 'base64')


      var qr = new QrCode();
      qr.callback = function(err, result) { 
        console.log("GOT BACK RESULT: ", err, result )
        console.log("BEGIN CROPPING:" )
        if (err) {
          alert(`ERROR: NO QR - ` + err)
        } else {
          // if i got qr,
          code = result.result.split('-')


          canvas.width = 2500

          // make a new image based on paper size
          // copy src image in
          if (code[1] == 'LTR') {
            canvas.height = Math.round(2500/(11/8.5))
          } else {
            canvas.height = Math.round(2500/(842/595))
          }

          context = canvas.getContext('2d')
          context.drawImage(sourceImage, 0,0, canvas.width, canvas.height)
          imageData = context.getImageData(0, 0, canvas.width, canvas.height);

          img_u8 = new jsfeat.matrix_t(canvas.width, canvas.height, jsfeat.U8_t | jsfeat.C1_t);
          img_u8_warp = new jsfeat.matrix_t(canvas.width, canvas.height, jsfeat.U8_t | jsfeat.C1_t);
          transform = new jsfeat.matrix_t(3, 3, jsfeat.F32_t | jsfeat.C1_t);
          jsfeat.math.perspective_4point_transform(transform, 
                                                          cornerPoints[0][0]*canvas.width,   cornerPoints[0][1]*canvas.height,   0,  0,
                                                          cornerPoints[1][0]*canvas.width,   cornerPoints[1][1]*canvas.height,   canvas.width, 0,
                                                          cornerPoints[2][0]*canvas.width,   cornerPoints[2][1]*canvas.height, canvas.width, canvas.height,
                                                          cornerPoints[3][0]*canvas.width,   cornerPoints[3][1]*canvas.height, 0, canvas.height);
          jsfeat.matmath.invert_3x3(transform, transform);

          jsfeat.imgproc.grayscale(imageData.data, canvas.width, canvas.height, img_u8);
          jsfeat.imgproc.warp_perspective(img_u8, img_u8_warp, transform, 0);

          var data_u32 = new Uint32Array(imageData.data.buffer);
          var alpha = (0xff << 24);
          var i = img_u8_warp.cols*img_u8_warp.rows, pix = 0;
          while(--i >= 0) {
            pix = img_u8_warp.data[i];
            data_u32[i] = alpha | (pix << 16) | (pix << 8) | pix;
          }
          context.putImageData(imageData, 0, 0);

          flatImage = document.createElement('canvas')
          flatImage.width = context.canvas.width
          flatImage.height = context.canvas.height
          flatImage.getContext('2d').drawImage(context.canvas, 0, 0)

          // get crop marks
          cropMarks = generateCropMarks(code[1], Number(code[5]), Number(code[2]), Number(code[3]), Number(code[4]))
          for (var i = 0; i < cropMarks.length; i++) {
            let fatOutline = 15
            context.lineWidth = fatOutline
            context.strokeStyle = 'rgba(20,20,200,0.1)';
            context.strokeRect(cropMarks[i][0]*canvas.width+offset[0]-(fatOutline/2), cropMarks[i][1]*canvas.height+offset[1]-(fatOutline/2), cropMarks[i][2]*canvas.width+(fatOutline*1), cropMarks[i][3]*canvas.height+(fatOutline*1))


            fatOutline = 0
            context.lineWidth = 1
            context.strokeStyle = 'rgba(20,20,200,1)';

            context.strokeRect(cropMarks[i][0]*canvas.width+offset[0]-fatOutline, cropMarks[i][1]*canvas.height+offset[1]-fatOutline, cropMarks[i][2]*canvas.width+(fatOutline*2), cropMarks[i][3]*canvas.height+(fatOutline*2))


          }

          // draw them        

          imgData = context.canvas.toDataURL().replace(/^data:image\/\w+;base64,/, '')
          fs.writeFileSync(path.join(app.getPath('temp'), 'flatpaper.png'), imgData, 'base64')

          document.querySelector("#preview").src = path.join(app.getPath('temp'), 'flatpaper.png?'+ Math.round(Math.random()*10000))
        }
      }
      qr.decode(qrImageData)





    }





    // // equalize
    // jsfeat.imgproc.equalize_histogram(img_u8, img_u8);
    // outputImage(img_u8, context, 'step3.png')



  }

  sourceImage.src = imageSrc[0]
}

function contrastImage(imageData, contrast) {

    var data = imageData.data;
    var factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    for(var i=0;i<data.length;i+=4)
    {
        data[i] = factor * (data[i] - 128) + 128;
        data[i+1] = factor * (data[i+1] - 128) + 128;
        data[i+2] = factor * (data[i+2] - 128) + 128;
    }
    return imageData;
}



const distance = ( x1, y1, x2, y2 ) => {
  
  var   xs = x2 - x1,
    ys = y2 - y1;   
  
  xs *= xs;
  ys *= ys;
   
  return Math.sqrt( xs + ys );
};

const angleDistance = (alpha, beta) => {
  let phi = Math.abs(beta - alpha) % Math.PI       // This is either the distance or 360 - distance
  let distance = phi > (Math.PI/2) ? Math.PI - phi : phi
  return distance
}



const checkLineIntersection = (line1StartX, line1StartY, line1EndX, line1EndY, line2StartX, line2StartY, line2EndX, line2EndY) => {
    // if the lines intersect, the result contains the x and y of the intersection (treating the lines as infinite) and booleans for whether line segment 1 or line segment 2 contain the point
    var denominator, a, b, numerator1, numerator2, result = {
        x: null,
        y: null,
        onLine1: false,
        onLine2: false
    };
    denominator = ((line2EndY - line2StartY) * (line1EndX - line1StartX)) - ((line2EndX - line2StartX) * (line1EndY - line1StartY));
    if (denominator == 0) {
        return result;
    }
    a = line1StartY - line2StartY;
    b = line1StartX - line2StartX;
    numerator1 = ((line2EndX - line2StartX) * a) - ((line2EndY - line2StartY) * b);
    numerator2 = ((line1EndX - line1StartX) * a) - ((line1EndY - line1StartY) * b);
    a = numerator1 / denominator;
    b = numerator2 / denominator;

    // if we cast these lines infinitely in both directions, they intersect here:
    result.x = line1StartX + (a * (line1EndX - line1StartX));
    result.y = line1StartY + (a * (line1EndY - line1StartY));
/*
        // it is worth noting that this should be the same as:
        x = line2StartX + (b * (line2EndX - line2StartX));
        y = line2StartX + (b * (line2EndY - line2StartY));
        */
    // if line1 is a segment and line2 is infinite, they intersect if:
    if (a > 0 && a < 1) {
        result.onLine1 = true;
    }
    // if line2 is a segment and line1 is infinite, they intersect if:
    if (b > 0 && b < 1) {
        result.onLine2 = true;
    }
    // if line1 and line2 are segments, they intersect if both of the above are true
    return result;
}

const outputImage = (img_u8, context, filename) => {
  let imageData = context.getImageData(0, 0, context.canvas.width, context.canvas.height)
  let data_u32 = new Uint32Array(imageData.data.buffer)
  let alpha = (0xff << 24)
  let i = img_u8.cols*img_u8.rows, pix = 0
  while(--i >= 0) {
    pix = img_u8.data[i]
    data_u32[i] = alpha | (pix << 16) | (pix << 8) | pix
  }
  context.putImageData(imageData, 0, 0)
  let imgData = context.canvas.toDataURL().replace(/^data:image\/\w+;base64,/, '')
  //let imageFilePath = path.join(boardPath, 'images', filename)
  fs.writeFileSync(filename, imgData, 'base64')
}


const generateCropMarks = (paperSize, aspectRatio, rows, cols, spacing) => {
  let headerHeight = 80
  let documentSize
  if (paperSize == 'LTR') {
    documentSize = [8.5*72,11*72]
  } else {
    documentSize = [595,842]
  }
  console.log(aspectRatio)
  aspectRatio = aspectRatio.toFixed(3)
  let margin = [22, 22, 22, 40]

  let boxesDim = [cols,rows]
  let boxSize = [(documentSize[1]-margin[0]-margin[2]-(spacing * (boxesDim[0]-1)))/boxesDim[0], (documentSize[0]-margin[1]-margin[3]-headerHeight-(spacing * (boxesDim[1])))/boxesDim[1] ]

  let cropMarks = []

  for (var iy = 0; iy < boxesDim[1]; iy++) {
    for (var ix = 0; ix < boxesDim[0]; ix++) {
      let x = margin[0]+(ix*boxSize[0])+(ix*spacing)
      let y = margin[1]+(iy*boxSize[1])+((iy+1)*spacing)+headerHeight
      let offset
      let box

      if((boxSize[0]/boxSize[1])>aspectRatio) {
        offset = [(boxSize[0]-(boxSize[1]*aspectRatio))/2,0]
        box = [x+offset[0],y, boxSize[1]*aspectRatio, boxSize[1]]
      } else {
        offset = [0, (boxSize[1]-(boxSize[0]/aspectRatio))/2]
        box = [x,y+offset[1], boxSize[0], boxSize[0]/aspectRatio]
      }
      cropMarks.push([box[0]/documentSize[1],box[1]/documentSize[0],box[2]/documentSize[1],box[3]/documentSize[0]])
    }
  }
  return cropMarks
}

ipcRenderer.on('worksheetImage', (event, args) => {
  processWorksheetImage(args)
  remote.getCurrentWindow().show()
})

window.ondragover = () => { return false }
window.ondragleave = () => { return false }
window.ondragend = () => { return false }
window.ondrop = () => { return false }