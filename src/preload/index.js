import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('deck', {
  platform: process.platform,
  projects: () => ipcRenderer.invoke('deck:projects'),
  sessions: () => ipcRenderer.invoke('deck:sessions'),
  ptySize: (uid) => ipcRenderer.invoke('deck:pty-size', uid),
  resize: (uid, cols, rows) => ipcRenderer.send('deck:resize', { uid, cols, rows }),
  stopProcess: (uid, pid) => ipcRenderer.invoke('deck:stop-process', { uid, pid }),
  focusApp: (uid) => ipcRenderer.invoke('deck:focus-app', uid),
  addTodo: (uid, text) => ipcRenderer.send('deck:todo-add', { uid, text }),
  toggleTodo: (projectKey, todoId) => ipcRenderer.send('deck:todo-toggle', { projectKey, todoId }),
  removeTodo: (projectKey, todoId) => ipcRenderer.send('deck:todo-remove', { projectKey, todoId }),
  backgrounds: () => ipcRenderer.invoke('deck:backgrounds'),
  chooseBackground: () => ipcRenderer.invoke('deck:choose-background'),
  ticketBase: () => ipcRenderer.invoke('deck:ticket-base'),
  setTicketBase: (url) => ipcRenderer.invoke('deck:set-ticket-base', url),
  worklogDays: () => ipcRenderer.invoke('deck:worklog-days'),
  worklog: (day) => ipcRenderer.invoke('deck:worklog', day),
  reply: (uid) => ipcRenderer.invoke('deck:reply', uid),
  summary: (uid) => ipcRenderer.invoke('deck:summary', uid),
  summarize: (uid) => ipcRenderer.invoke('deck:summarize', uid),
  setTicket: (key, ticket) => ipcRenderer.invoke('deck:set-ticket', { key, ticket }),
  launch: (projectId) => ipcRenderer.invoke('deck:launch', projectId),
  chooseDirectory: () => ipcRenderer.invoke('deck:choose-directory'),
  launchDirectory: (dir) => ipcRenderer.invoke('deck:launch-directory', dir),
  recentDirectories: () => ipcRenderer.invoke('deck:recent-directories'),
  resume: (sessionId) => ipcRenderer.invoke('deck:resume', sessionId),
  buffer: (sessionId) => ipcRenderer.invoke('deck:buffer', sessionId),
  gitRepos: (sessionId) => ipcRenderer.invoke('deck:git-repos', sessionId),
  gitDiff: (root, path, group) => ipcRenderer.invoke('deck:git-diff', { root, path, group }),
  composerState: (uid) => ipcRenderer.invoke('deck:composer-state', uid),
  composerOutdated: (uid, branch) => ipcRenderer.invoke('deck:composer-outdated', { uid, branch }),
  workflow: () => ipcRenderer.invoke('deck:workflow'),
  composerOp: (uid, branch) => ipcRenderer.invoke('deck:composer-op', { uid, branch }),
  composerUpdate: (uid, branch, packages) => ipcRenderer.invoke('deck:composer-update', { uid, branch, packages }),
  composerCommit: (uid, branch, message) => ipcRenderer.invoke('deck:composer-commit', { uid, branch, message }),
  composerPush: (uid, branch) => ipcRenderer.invoke('deck:composer-push', { uid, branch }),
  composerUndoCommit: (uid, branch) => ipcRenderer.invoke('deck:composer-undoCommit', { uid, branch }),
  composerDiscard: (uid, branch) => ipcRenderer.invoke('deck:composer-discard', { uid, branch }),
  composerRetry: (uid, branch) => ipcRenderer.invoke('deck:composer-retry', { uid, branch }),
  composerDiff: (uid, branch) => ipcRenderer.invoke('deck:composer-diff', { uid, branch }),
  composerPrompt: (uid, branch) => ipcRenderer.invoke('deck:composer-prompt', { uid, branch }),
  composerPaste: (uid, branch) => ipcRenderer.invoke('deck:composer-paste', { uid, branch }),
  onComposerOp: (cb) => {
    const h = (_e, state) => cb(state)
    ipcRenderer.on('deck:composer-op', h)
    return () => ipcRenderer.removeListener('deck:composer-op', h)
  },
  setWorkflow: (settings) => ipcRenderer.invoke('deck:set-workflow', settings),
  setProjectWorkflow: (uid, id) => ipcRenderer.invoke('deck:set-project-workflow', { uid, id }),

  // Where a dropped file lives on disk; '' for one that is not a file on disk
  // (an image dragged out of a web page).
  pathForFile: (file) => webUtils.getPathForFile(file),
  write: (sessionId, data) => ipcRenderer.send('deck:write', { sessionId, data }),
  close: (sessionId) => ipcRenderer.send('deck:close', sessionId),
  remove: (sessionId) => ipcRenderer.send('deck:remove', sessionId),
  rename: (sessionId, name) => ipcRenderer.send('deck:rename', { sessionId, name }),
  forgetTestPage: (projectKey, pageId) =>
    ipcRenderer.send('deck:forget-test-page', { projectKey, pageId }),
  forgetPullRequest: (projectKey, prId) => ipcRenderer.send('deck:forget-pull-request', { projectKey, prId }),
  openExternal: (url) => ipcRenderer.send('deck:open-external', url),
  updateState: () => ipcRenderer.invoke('deck:update-state'),
  checkForUpdate: () => ipcRenderer.invoke('deck:update-check'),
  downloadUpdate: () => ipcRenderer.invoke('deck:update-download'),
  installUpdate: () => ipcRenderer.invoke('deck:update-install'),
  mediaState: () => ipcRenderer.invoke('deck:media-state'),
  setMediaEnabled: (on) => ipcRenderer.send('deck:media-enabled', on),
  mediaCommand: (verb) => ipcRenderer.send('deck:media-command', verb),
  mediaRetry: () => ipcRenderer.send('deck:media-retry'),
  openAutomationSettings: () => ipcRenderer.send('deck:open-automation-settings'),

  onSessions: (cb) => {
    const h = (_e, sessions) => cb(sessions)
    ipcRenderer.on('deck:sessions', h)
    return () => ipcRenderer.removeListener('deck:sessions', h)
  },
  onUpdate: (cb) => {
    const h = (_e, state) => cb(state)
    ipcRenderer.on('deck:update', h)
    return () => ipcRenderer.removeListener('deck:update', h)
  },
  onMedia: (cb) => {
    const h = (_e, state) => cb(state)
    ipcRenderer.on('deck:media', h)
    return () => ipcRenderer.removeListener('deck:media', h)
  },
  onSettingsOpen: (cb) => {
    const h = () => cb()
    ipcRenderer.on('deck:settings-open', h)
    return () => ipcRenderer.removeListener('deck:settings-open', h)
  },
  onUpdateOpen: (cb) => {
    const h = () => cb()
    ipcRenderer.on('deck:update-open', h)
    return () => ipcRenderer.removeListener('deck:update-open', h)
  },
  onData: (cb) => {
    const h = (_e, payload) => cb(payload)
    ipcRenderer.on('deck:data', h)
    return () => ipcRenderer.removeListener('deck:data', h)
  }
})
