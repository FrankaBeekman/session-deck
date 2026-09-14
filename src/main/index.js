import { app, BrowserWindow, ipcMain, Notification, shell, Menu, nativeImage, dialog } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { listProjects, getProject } from './local.js'
import { registry, COLS, ROWS } from './registry.js'
import { startHookServer } from './hooks.js'
import { reposForSession, fileDiff } from './git.js'

// Must run before `ready`, or the menu bar and About panel say "Electron".
app.setName('Session Deck')

let win = null
const notified = new Set()

/** A window can be destroyed between an event firing and this running. */
function send(channel, payload) {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return
  win.webContents.send(channel, payload)
}

/** In dev we run Electron's own binary, so the dock icon needs setting by hand. */
function applyDevIcon() {
  if (app.isPackaged || process.platform !== 'darwin') return
  const icon = join(__dirname, '../../build/icon.png')
  if (existsSync(icon)) app.dock.setIcon(nativeImage.createFromPath(icon))
}

/**
 * Electron's default menu is labelled "Electron" and omits Edit, so the focused
 * terminal has no copy/paste. This replaces it with a minimal correct one.
 */
function applyMenu() {
  const template = [
    {
      label: 'Session Deck',
      submenu: [
        { role: 'about', label: 'About Session Deck' },
        { type: 'separator' },
        { role: 'hide', label: 'Hide Session Deck' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit Session Deck' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 720,
    show: false,
    title: 'Session Deck',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.once('ready-to-show', () => win.show())

  // Without this, `win` stays a live reference to a destroyed object and every
  // later send throws "Object has been destroyed".
  win.on('closed', () => {
    win = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * Notify for every blocked session, per the v1 decision. If this turns noisy,
 * the first thing to cut is notifying for a session already visible on screen.
 */
function notifyBlocked(sessions) {
  for (const s of sessions) {
    if (s.status === 'needs-you' && !notified.has(s.id)) {
      notified.add(s.id)
      new Notification({
        title: s.name ?? s.project.name,
        body: s.question ?? 'Needs your input',
        silent: false
      }).show()
    }
    if (s.status !== 'needs-you') notified.delete(s.id)
  }
}

app.whenReady().then(() => {
  applyDevIcon()
  applyMenu()
  startHookServer(() => {
    dialog.showMessageBox({
      type: 'warning',
      title: 'Session Deck is already running',
      message: 'Another Session Deck has the status port.',
      detail:
        'This window can still launch and drive sessions, but status pills and ' +
        'notifications will go to the other instance. Quit it, then reopen this one.',
      buttons: ['OK']
    })
  })
  createWindow()

  registry.on('change', (sessions) => {
    notifyBlocked(sessions)
    send('deck:sessions', sessions)
  })

  registry.on('data', (sessionId, chunk) => {
    send('deck:data', { sessionId, chunk })
  })

  ipcMain.handle('deck:projects', () => listProjects())
  ipcMain.handle('deck:sessions', () => registry.serialize())
  ipcMain.handle('deck:pty-size', () => ({ cols: COLS, rows: ROWS }))

  ipcMain.handle('deck:resume', (_e, sessionId) => registry.resume(sessionId)?.id ?? null)

  ipcMain.handle('deck:launch', (_e, projectId) => {
    const project = getProject(projectId)
    if (!project) throw new Error(`Unknown project: ${projectId}`)
    return registry.launch(project).id
  })

  ipcMain.handle('deck:git-repos', async (_e, sessionId) => {
    const s = registry.get(sessionId)
    if (!s) return []
    return reposForSession(s.cwd ?? s.project.path, s.touched ?? [])
  })

  ipcMain.handle('deck:git-diff', (_e, { root, path, untracked }) =>
    fileDiff(root, path, { untracked })
  )

  ipcMain.handle('deck:buffer', (_e, sessionId) => registry.get(sessionId)?.buffer ?? '')
  ipcMain.on('deck:write', (_e, { sessionId, data }) => registry.write(sessionId, data))
  ipcMain.on('deck:close', (_e, sessionId) => registry.close(sessionId))
  ipcMain.on('deck:remove', (_e, sessionId) => registry.remove(sessionId))
  ipcMain.on('deck:forget-test-page', (_e, { projectKey, pageId }) =>
    registry.forgetTestPage(projectKey, pageId)
  )
  ipcMain.on('deck:open-external', (_e, url) => shell.openExternal(url))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Closing the window must not kill the sessions -- watching long-running work is
// the entire point of the app. On macOS the app stays in the dock with its
// sessions alive and the window reopens showing them; elsewhere, closing quits.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Sessions are children of this process, so quitting really does take them with
// it. Their UUIDs survive, so v1.5 can offer `claude --resume <uuid>`.
app.on('before-quit', () => {
  // Synchronous — a debounced write would never fire during shutdown.
  registry.flushStore()
  for (const s of registry.serialize()) registry.close(s.id)
})
