/**
 * Render the built renderer with fixture data and save a PNG.
 *   npx electron scripts/preview/render.cjs <scenario> <out.png> [width] [height]
 * Scenarios click through the real UI, so what gets captured is what a user
 * would see — not a separately maintained mock.
 */
const { app, BrowserWindow } = require('electron')
const { writeFileSync } = require('fs')
const { join } = require('path')

const [scenario = 'deck', out = 'preview.png', w = '1180', h = '820'] = process.argv.slice(2)

const SCENARIOS = {
  deck: [],
  pages: ["[...document.querySelectorAll('.links a')].find(a => /^all/.test(a.textContent)).click()"],
  diff: ["[...document.querySelectorAll('.links a')].find(a => /Diff/.test(a.textContent)).click()"],
  focused: ["document.querySelector('.card').click()"],
  new: ["document.querySelector('.titlebar .newbtn').click()"],
  newdir: ["document.querySelector('.titlebar .newbtn').click()", "document.querySelector('#tab-directory').click()"],
  todos: ["[...document.querySelectorAll('.links a')].find(a => /to-do/.test(a.textContent)).click()"],
  procs: ["[...document.querySelectorAll('.links a')].find(a => /running/.test(a.textContent)).click()"],
  worklog: ["[...document.querySelectorAll('.titlebar button')].find(b => /Worked on/.test(b.textContent)).click()"],
  tall: ["document.querySelector('[data-density=\"tall\"]').click()"],
  closed: ["[...document.querySelectorAll('.card')].find(c => c.classList.contains('closed')).click()"]
}

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: Number(w), height: Number(h), show: false,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: false, backgroundThrottling: false }
  })
  await win.loadFile(join(__dirname, '../../out/renderer/index.html'))
  // A hidden window throttles animation, so a capture could freeze a transition
  // halfway. Screenshots must show end states.
  await win.webContents.insertCSS('*,*::before,*::after{transition:none!important;animation:none!important}')
  await new Promise((r) => setTimeout(r, 500))
  for (const js of SCENARIOS[scenario] ?? []) {
    await win.webContents.executeJavaScript(js)
    await new Promise((r) => setTimeout(r, 400))
  }
  writeFileSync(out, (await win.capturePage()).toPNG())
  console.log(`preview: ${scenario} -> ${out}`)
  app.exit(0)
})
