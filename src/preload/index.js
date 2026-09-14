import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('deck', {
  projects: () => ipcRenderer.invoke('deck:projects'),
  sessions: () => ipcRenderer.invoke('deck:sessions'),
  ptySize: () => ipcRenderer.invoke('deck:pty-size'),
  launch: (projectId) => ipcRenderer.invoke('deck:launch', projectId),
  resume: (sessionId) => ipcRenderer.invoke('deck:resume', sessionId),
  buffer: (sessionId) => ipcRenderer.invoke('deck:buffer', sessionId),
  gitRepos: (sessionId) => ipcRenderer.invoke('deck:git-repos', sessionId),
  gitDiff: (root, path, untracked) =>
    ipcRenderer.invoke('deck:git-diff', { root, path, untracked }),

  write: (sessionId, data) => ipcRenderer.send('deck:write', { sessionId, data }),
  close: (sessionId) => ipcRenderer.send('deck:close', sessionId),
  remove: (sessionId) => ipcRenderer.send('deck:remove', sessionId),
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
