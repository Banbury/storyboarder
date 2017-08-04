const {shell, ipcRenderer} = require('electron')
const EventEmitter = require('events').EventEmitter
const Tether = require('tether')
const PomodoroTimer = require('../pomodoro-timer.js')
const prefsModule = require('electron').remote.require('./prefs.js')
const userDataHelper = require('../files/user-data-helper.js')

class PomodorTimerView extends EventEmitter {
  constructor() {
    super()

    this.el = null
    this.innerEl = null
    this.minutesInput = null

    this.pomodoroTimerMinutes = prefsModule.getPrefs('main')['pomodoroTimerMinutes']

    this.pomodoroTimer = new PomodoroTimer()
    this.pomodoroTimer.on('update', (data)=>{
      this.emit('update', data)
      this.update(data)
    })
    this.state = this.pomodoroTimer.state
    this.create()

    userDataHelper.getData('recordings.json')
      .then(recordings => {
        this.recordings = recordings
        let recordingsView = ''
        if(this.recordings && this.recordings.length) {
          let isMain = true
          for(let recordingPath of recordings) {
            if(isMain) {
              recordingsView += `<div><img class="pomodoro-timer-recording pomodoro-timer-recording-main" src="${recordingPath}" data-filepath="${recordingPath}"></img></div>`
              isMain = false
            }
            recordingsView += `<div><img class="pomodoro-timer-recording pomodoro-timer-recording-small" src="${recordingPath}" data-filepath="${recordingPath}"></img></div>`
          }
          this.el.querySelector('#pomodoro-timer-recordings').innerHTML = recordingsView
          let recordingImages = this.el.querySelectorAll(".pomodoro-timer-recording")
          for(let i=0; i<recordingImages.length && i<5; i++) {
            let recordingImage = recordingImages[i]
            recordingImage.addEventListener('click', (event)=>{
              event.preventDefault()
              shell.showItemInFolder(event.target.dataset.filepath)
            })
          }
        }
      })
      .catch(error => {
        this.recordings = []
      })
  }

  template() {
    return `<div id="pomodoro-timer-container" class="pomodoro-timer-container popup-container">
      <div id="context-menu" class="pomodoro-timer">
        <h3 id="pomodoro-timer-title">Sketch Sprint</h3>
        <input id="pomodoro-timer-minutes-input" class="pomodoro-timer-minutes-input" type="number" id="minutesInput" value="${this.pomodoroTimerMinutes}">
        <label id="pomodoro-timer-minutes-label" for="username">minutes</label>
        <div id="pomodoro-timer-remaining" class="pomodoro-timer-remaining" style="display: none"></div>
        <div id="pomodoro-timer-success" class="pomodoro-timer-success" style="display: none">
          <div>🎊</div>
          <div>Break time!</div>
        </div>
        <button id="pomodoro-timer-start-button" class="pomodoro-timer-button">Start</button>
        <button id="pomodoro-timer-cancel-button"  class="pomodoro-timer-button" style="display: none">Cancel</button>
        <button id="pomodoro-timer-continue-button"  class="pomodoro-timer-button" style="display: none">Continue</button>
        <div id="pomodoro-timer-recordings-label">Latest Timelapses</div>
        <div id="pomodoro-timer-recordings">
        </div>
      </div>
    </div>`
  }

  update(data) {
    switch(data.state) {
      case "rest":
        this.el.querySelector('#pomodoro-timer-minutes-label').style.display = "inline-block"
        this.el.querySelector('#pomodoro-timer-minutes-input').style.display = "inline-block"
        this.el.querySelector('#pomodoro-timer-remaining').style.display = "none"
        this.el.querySelector('#pomodoro-timer-success').style.display = "none"
        this.el.querySelector('#pomodoro-timer-start-button').style.display = "inline-block"
        this.el.querySelector('#pomodoro-timer-cancel-button').style.display = "none"
        this.el.querySelector('#pomodoro-timer-continue-button').style.display = "none"
        break
      case "running":
        this.el.querySelector('#pomodoro-timer-minutes-label').style.display = "none"
        this.el.querySelector('#pomodoro-timer-minutes-input').style.display = "none"
        let remainingView = this.el.querySelector('#pomodoro-timer-remaining', true)
        remainingView.style.display = "inline-block"
        remainingView.innerHTML = data.remainingFriendly
        this.el.querySelector('#pomodoro-timer-success').style.display = "none"
        this.el.querySelector('#pomodoro-timer-start-button').style.display = "none"
        this.el.querySelector('#pomodoro-timer-cancel-button').style.display = "inline-block"
        this.el.querySelector('#pomodoro-timer-continue-button').style.display = "none"
        break
      case "paused":
        break
      case "completed":
        this.el.querySelector('#pomodoro-timer-minutes-label').style.display = "none"
        this.el.querySelector('#pomodoro-timer-minutes-input').style.display = "none"
        this.el.querySelector('#pomodoro-timer-remaining').style.display = "none"
        this.el.querySelector('#pomodoro-timer-success').style.display = "inline-block"
        this.el.querySelector('#pomodoro-timer-start-button').style.display = "none"
        this.el.querySelector('#pomodoro-timer-cancel-button').style.display = "none"
        this.el.querySelector('#pomodoro-timer-continue-button').style.display = "inline-block"
        this.fadeIn()
        break
    }
    
  }

  create () {
    let t = document.createElement('template')
    t.innerHTML = this.template()

    this.el = t.content.firstChild
    document.getElementById('storyboarder-main').appendChild(this.el)

    let startButton = this.el.querySelector('#pomodoro-timer-start-button')
    startButton.addEventListener('click', (event)=>{
      this.startTimer()
    })

    let cancelButton = this.el.querySelector('#pomodoro-timer-cancel-button')
    cancelButton.addEventListener('click', (event)=>{
      this.cancelTimer()
    })
    
    let continueButton = this.el.querySelector('#pomodoro-timer-continue-button')
    continueButton.addEventListener('click', (event)=>{
      this.continue()
    })

    this.el.addEventListener('pointerleave', this.onPointerLeave.bind(this))
    
    this.innerEl = this.el.querySelector('.pomodoro-timer')
    this.minutesInput = this.el.querySelector("#pomodoro-timer-minutes-input")
  }

  attachTo (target) {
    if (this.target !== target) {
      if (this.tethered) this.remove()

      this.target = target
      this.tethered = new Tether({
        element: this.el,
        target: this.target,
        attachment: 'top center',
        targetAttachment: 'bottom center',
        offset: '-18px 0'
      })
    }
    ipcRenderer.send('textInputMode', true)
    this.fadeIn()
  }

  fadeIn () {
    this.innerEl.classList.add('appear-anim')
  }

  fadeOut () {
    this.innerEl.classList.remove('appear-anim')
  }

  onPointerLeave (event) {
    this.remove()
  }

  remove () {
    ipcRenderer.send('textInputMode', false)
    this.target = null
    this.fadeOut()
    this.tethered && this.tethered.destroy()
  }

  // Timer Controls
  startTimer() {
    this.pomodoroTimerMinutes = parseInt(this.minutesInput.value)
    this.pomodoroTimer.setDuration(this.pomodoroTimerMinutes)
    this.pomodoroTimer.start()
    this.emit("start", {duration: this.pomodoroTimerMinutes})

    prefsModule.set('pomodoroTimerMinutes', this.pomodoroTimerMinutes)
  }

  cancelTimer() {
    this.pomodoroTimer.cancel()
    this.emit("cancel")
  }
  
  continue() {
    this.pomodoroTimer.reset()
  }
}

module.exports = PomodorTimerView