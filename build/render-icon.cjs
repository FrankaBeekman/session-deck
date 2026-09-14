const { app, BrowserWindow } = require('electron')
const { writeFileSync } = require('fs')
const { join } = require('path')

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024, height: 1024, show: false, frame: false,
    transparent: true, backgroundColor: '#00000000',
    webPreferences: { offscreen: false }
  })
  await win.loadFile(join(__dirname, 'icon.html'))
  await new Promise((r) => setTimeout(r, 600))
  const img = await win.capturePage()
  writeFileSync(join(__dirname, 'icon-1024.png'), img.toPNG())
  console.log('wrote build/icon-1024.png')
  app.exit(0)
})
