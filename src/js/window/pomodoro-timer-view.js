const {shell, ipcRenderer} = require('electron')
const EventEmitter = require('events').EventEmitter
const Tether = require('tether')
const PomodoroTimer = require('../pomodoro-timer.js')
const prefsModule = require('electron').remote.require('./prefs.js')
const userDataHelper = require('../files/user-data-helper.js')
const moment = require('moment')

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
        this.updateRecordingsView()
      })
      .catch(error => {
        this.recordings = []
      })
  }

  template() {
    return `<div id="pomodoro-timer-container" class="pomodoro-timer-container popup-container">
      <div id="pomodoro-timer" class="pomodoro-timer top-nub">
      </div>
    </div>`
  }

  update(data) {
    if(data.state != this.state) {
      this.transitionToState(data.state)
    }
    switch(data.state) {
      case "rest":
        break
      case "running":
        let remainingView = this.el.querySelector('#pomodoro-timer-remaining', true)
        remainingView.style.display = "inline-block"
        remainingView.innerHTML = data.remainingFriendly
        break
      case "paused":
        break
      case "completed":
        this.fadeIn()
        break
    }
    
  }

  transitionToState(newState) {
    let content
    switch(newState) {
      case "rest":
        content = `
          <h3 id="pomodoro-timer-title">Sketch Sprint</h3>
          <input id="pomodoro-timer-minutes-input" class="pomodoro-timer-minutes-input" type="number" id="minutesInput" value="${this.pomodoroTimerMinutes}">
          <div id="pomodoro-timer-minutes-label">minutes</div>
          <button id="pomodoro-timer-start-button" class="pomodoro-timer-button">Start</button>
          <div id="pomodoro-timer-recordings-label">Latest Timelapses</div>
          <div id="pomodoro-timer-recordings">
          </div>
        `
        this.el.querySelector('#pomodoro-timer').innerHTML = content
        let startButton = this.el.querySelector('#pomodoro-timer-start-button')
        startButton.addEventListener('click', (event)=>{
          this.startTimer()
        })
        this.updateRecordingsView()
        break
      case "running":
        content = `
          <h3 id="pomodoro-timer-title">Sketch Sprint</h3>
          <div id="pomodoro-timer-remaining" class="pomodoro-timer-remaining">${this.getStartTimeFriendly()}</div>
          <div id="pomodoro-timer-minutes-label">minutes</div>
          <button id="pomodoro-timer-cancel-button"  class="pomodoro-timer-button">Cancel</button>
          <div id="pomodoro-timer-recordings-label">Latest Timelapses</div>
          <div id="pomodoro-timer-recordings">
          </div>
        `
        this.el.querySelector('#pomodoro-timer').innerHTML = content

        let cancelButton = this.el.querySelector('#pomodoro-timer-cancel-button')
        cancelButton.addEventListener('click', (event)=>{
          this.cancelTimer()
        })
        this.updateRecordingsView()
        break
      case "completed":
        content = `
          <h3 id="pomodoro-timer-title">Sketch Sprint</h3>
          <div id="pomodoro-timer-success" class="pomodoro-timer-success">
            <div>U R</div>
            <div>SMART!</div>
          </div>
          <div>
            Or at least smarter than Donald Trump's kids. That's a great session you just had, and that's a great timelapse.
          </div>
          <button id="pomodoro-timer-continue-button"  class="pomodoro-timer-button">Continue</button>
        `
        this.el.querySelector('#pomodoro-timer').innerHTML = content
        let continueButton = this.el.querySelector('#pomodoro-timer-continue-button')
        continueButton.addEventListener('click', (event)=>{
          this.continue()
        })
        this.fadeIn()
        break
    }
    this.state = newState
  }

  create () {
    let t = document.createElement('template')
    t.innerHTML = this.template()

    this.el = t.content.firstChild
    document.getElementById('storyboarder-main').appendChild(this.el)

    this.transitionToState(this.state)

    this.el.addEventListener('pointerleave', this.onPointerLeave.bind(this))
    
    this.innerEl = this.el.querySelector('.pomodoro-timer')
    this.minutesInput = this.el.querySelector("#pomodoro-timer-minutes-input")
  }

  updateRecordingsView() {
    let recordingsView = ''
    if(this.recordings && this.recordings.length) {
      let isMain = true
      for(let i=0; i<this.recordings.length && i<5; i++) {
        let recordingPath = this.recordings[i]
        recordingsView += `<div><img class="pomodoro-timer-recording" src="${recordingPath}" data-filepath="${recordingPath}"></img></div>`
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
    this.emit("start", {duration: this.pomodoroTimerMinutes, remainingFriendly: this.getStartTimeFriendly()})
    this.transitionToState("running")

    prefsModule.set('pomodoroTimerMinutes', this.pomodoroTimerMinutes)
  }

  cancelTimer() {
    this.pomodoroTimer.cancel()
    this.transitionToState("rest")
    this.emit("cancel")
  }
  
  continue() {
    this.pomodoroTimer.reset()
  }
  
  getStartTimeFriendly() {
    // the timer immediately jumps to XX:59, so let's just start the display
    // at XX:59 to make it smooth
    let mm = moment.duration(this.pomodoroTimerMinutes * 60 * 1000)
    let secondsFriendly = 59 // the input is always minutes, so -1 = 59 seconds
    let remainingFriendly = `${mm.minutes()-1}:${secondsFriendly}`
    return remainingFriendly
  }
}

module.exports = PomodorTimerView