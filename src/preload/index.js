import { contextBridge, ipcRenderer } from 'electron'

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
  worklogDays: () => ipcRenderer.invoke('deck:worklog-days'),
  worklog: (day) => ipcRenderer.invoke('deck:worklog', day),
  launch: (projectId) => ipcRenderer.invoke('deck:launch', projectId),
  chooseDirectory: () => ipcRenderer.invoke('deck:choose-directory'),
  launchDirectory: (dir) => ipcRenderer.invoke('deck:launch-directory', dir),
  recentDirectories: () => ipcRenderer.invoke('deck:recent-directories'),
  resume: (sessionId) => ipcRenderer.invoke('deck:resume', sessionId),
  buffer: (sessionId) => ipcRenderer.invoke('deck:buffer', sessionId),
  gitRepos: (sessionId) => ipcRenderer.invoke('deck:git-repos', sessionId),
  gitDiff: (root, path, group) => ipcRenderer.invoke('deck:git-diff', { root, path, group }),

  write: (sessionId, data) => ipcRenderer.send('deck:write', { sessionId, data }),
  close: (sessionId) => ipcRenderer.send('deck:close', sessionId),
  remove: (sessionId) => ipcRenderer.send('deck:remove', sessionId),
  rename: (sessionId, name) => ipcRenderer.send('deck:rename', { sessionId, name }),
  forgetTestPage: (projectKey, pageId) =>
    ipcRenderer.send('deck:forget-test-page', { projectKey, pageId }),
  openExternal: (url) => ipcRenderer.send('deck:open-external', url),

  onSessions: (cb) => {
    const h = (_e, sessions) => cb(sessions)
    ipcRenderer.on('deck:sessions', h)
    return () => ipcRenderer.removeListener('deck:sessions', h)
  },
  onData: (cb) => {
    const h = (_e, payload) => cb(payload)
    ipcRenderer.on('deck:data', h)
    return () => ipcRenderer.removeListener('deck:data', h)
  }
})
