const assert = require('assert')

const exporterFcp = require('../../src/js/exporters/final-cut-pro.js')

let boardFileData = {
  "version": "0.6.0",
  "aspectRatio": 1,
  "fps": 24,
  "defaultBoardTiming": 2000,
  "boards": [
    {
      "uid": "7BZ4P",
      "url": "board-1-7BZ4P.png",
      "newShot": false,
      "lastEdited": 1498663891537,
      "layers": {
        "reference": {
          "url": "board-1-7BZ4P-reference.png"
        },
        "notes": {
          "url": "board-1-7BZ4P-notes.png"
        }
      },
      "number": 1,
      "shot": "1A",
      "time": 0,
      "duration": 999,
      "lineMileage": 1117.4179067245605,
      "dialogue": "dialogue here",
      "action": "action here",
      "notes": "notes here"
    },
    {
      "uid": "9MZ1P",
      "url": "board-2-9MZ1P.png",
      "newShot": false,
      "lastEdited": 1498663901313,
      "layers": {
        "reference": {
          "url": "board-2-9MZ1P-reference.png"
        },
        "notes": {
          "url": "board-2-9MZ1P-notes.png"
        }
      },
      "number": 2,
      "shot": "2A",
      "time": 999,
      "duration": 1001,
      "lineMileage": 1387.726619398883
    }
  ]
}

describe('exporters/final-cut-pro', () => {
  it('can generate final cut pro / adobe premiere xml', () => {
    assert.doesNotThrow(() => {
      let projectFileAbsolutePath = '/Users/me/projects/storyboarder/example/example.storyboarder'
      let outputPath = '/Users/me/projects/storyboarder/example/example.storyboarder/exports/output'
      let xml = exporterFcp.generateFinalCutProXml(exporterFcp.generateFinalCutProData(boardFileData, { projectFileAbsolutePath, outputPath }))
      assert(xml.length > 32)
    })
  })
})