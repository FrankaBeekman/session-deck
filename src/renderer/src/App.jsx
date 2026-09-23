import { useEffect, useState, useCallback } from 'react'
import SessionTile from './components/SessionTile.jsx'
import FocusedSession from './components/FocusedSession.jsx'
import NewSession from './components/NewSession.jsx'
import LinksPanel from './components/LinksPanel.jsx'
import SummaryPanel from './components/SummaryPanel.jsx'
import DiffPanel from './components/DiffPanel.jsx'
import ChecklistPanel from './components/ChecklistPanel.jsx'
import ProcessesPanel from './components/ProcessesPanel.jsx'
import WorkLogPanel from './components/WorkLogPanel.jsx'
import UpdatePanel from './components/UpdatePanel.jsx'
import Appearance, { bgUrl } from './components/Appearance.jsx'
import { applyTheme } from './themes.js'
import { ipcError } from './lib/format.js'

/**
 * Look and feel, all deck-wide. Tile height is a setting rather than a drag
 * handle per tile: ragged rows in a grid help nobody.
 */
const LINES = { small: 4, medium: 8, large: 14 }
const TILE_FONT = { small: '0.6rem', medium: '0.685rem', large: '0.8rem' }
const TERM_FONT = { small: 11, medium: 12.5, large: 14.5 }
const DIM = { subtle: '55%', medium: '75%', strong: '90%' }
const DEFAULTS = {
  theme: 'default',
  mode: 'system',
  skin: 'plain',
  density: 'small',
  tileFont: 'medium',
  termFont: 'medium',
  background: { path: null, dim: 'medium' },
  tileOpacity: 1
}

const prefersDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
const resolveMode = (mode) => (mode === 'system' ? (prefersDark() ? 'dark' : 'light') : mode)

function readSettings() {
  try {
    const saved = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('deck.appearance') ?? '{}') }
    // Themes used to be single-mode, with 'system' as a theme name.
    if (saved.theme === 'system' || saved.theme === 'light' || saved.theme === 'dark') {
      return { ...saved, theme: 'default', mode: saved.theme === 'system' ? 'system' : saved.theme }
    }
    return saved
  } catch {
    return { ...DEFAULTS }
  }
}

export default function App() {
  const [sessions, setSessions] = useState([])
  // All selection keys on `uid`: a session's `id` can change underneath it.
  const [focusedUid, setFocusedUid] = useState(null)
  const [picking, setPicking] = useState(false)
  const [links, setLinks] = useState(null) // { uid, kind: 'pages' | 'prs' }
  const [diffUid, setDiffUid] = useState(null)
  const [summaryUid, setSummaryUid] = useState(null)
  const [todoUid, setTodoUid] = useState(null)
  const [procUid, setProcUid] = useState(null)
  const [worklogOpen, setWorklogOpen] = useState(false)
  const [settings, setSettings] = useState(readSettings)
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const [launchError, setLaunchError] = useState(null)
  const [update, setUpdate] = useState({ status: 'idle' })
  const [updateOpen, setUpdateOpen] = useState(false)

  useEffect(() => {
    window.deck.updateState().then(setUpdate)
    const offState = window.deck.onUpdate(setUpdate)
    const offOpen = window.deck.onUpdateOpen(() => setUpdateOpen(true))
    return () => {
      offState()
      offOpen()
    }
  }, [])

  useEffect(() => {
    window.deck.sessions().then(setSessions)
    return window.deck.onSessions(setSessions)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('deck.appearance', JSON.stringify(settings))
    } catch {}
    applyTheme(settings.theme, resolveMode(settings.mode))
    const root = document.documentElement
    // Shapes only (skins.css); colours stay the theme's.
    if (settings.skin && settings.skin !== 'plain') root.dataset.skin = settings.skin
    else delete root.dataset.skin
    root.style.setProperty('--tile-font', TILE_FONT[settings.tileFont] ?? TILE_FONT.medium)
    // The scrim keeps tiles readable over a busy image; with no image it is the
    // page colour at full strength.
    const bg = settings.background ?? DEFAULTS.background
    root.style.setProperty('--bg-image', bg.path ? `url("${bgUrl(bg.path)}")` : 'none')
    root.style.setProperty('--bg-dim', bg.path ? (DIM[bg.dim] ?? DIM.medium) : '100%')
    root.style.setProperty('--tile-alpha', `${Math.round((settings.tileOpacity ?? 1) * 100)}%`)
  }, [settings])

  // Follow the OS while the mode is "system".
  useEffect(() => {
    if (settings.mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme(settings.theme, resolveMode('system'))
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [settings.mode, settings.theme])

  useEffect(() => {
    // Close the topmost layer only, so Esc in a panel opened from the focused
    // view returns to the terminal instead of dismissing both.
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (links) return setLinks(null)
      if (summaryUid) return setSummaryUid(null)
      if (diffUid) return setDiffUid(null)
      if (todoUid) return setTodoUid(null)
      if (procUid) return setProcUid(null)
      if (updateOpen) return setUpdateOpen(false)
      if (worklogOpen) return setWorklogOpen(false)
      if (appearanceOpen) return setAppearanceOpen(false)
      if (picking) return setPicking(false)
      setFocusedUid(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [links, summaryUid, diffUid, todoUid, procUid, updateOpen, worklogOpen, appearanceOpen, picking])

  const reopen = useCallback(async (uid) => {
    try {
      const id = await window.deck.resume(uid)
      if (id) setFocusedUid(id)
    } catch (err) {
      setLaunchError(ipcError(err))
    }
  }, [])

  // These throw on failure, and the picker stays open to show why.
  const launch = useCallback(async (projectId) => {
    const uid = await window.deck.launch(projectId)
    setPicking(false)
    setFocusedUid(uid)
  }, [])

  const launchDirectory = useCallback(async (dir) => {
    const uid = await window.deck.launchDirectory(dir)
    setPicking(false)
    setFocusedUid(uid)
  }, [])

  const byUid = (uid) => sessions.find((s) => s.uid === uid) ?? null
  const focused = byUid(focusedUid)
  const linksSession = links && byUid(links.uid)
  const diffSession = byUid(diffUid)
  const summarySession = byUid(summaryUid)
  const todoSession = byUid(todoUid)
  const procSession = byUid(procUid)
  const running = sessions.filter((s) => s.attached || (s.external && s.status !== 'closed')).length
  const waiting = sessions.filter((s) => s.status === 'needs-you').length
  const lines = LINES[settings.density] ?? LINES.small

  const handlers = (s) => ({
    onShowPages: () => setLinks({ uid: s.uid, kind: 'pages' }),
    onShowPrs: () => setLinks({ uid: s.uid, kind: 'prs' }),
    onShowDiff: () => setDiffUid(s.uid),
    onShowSummary: () => setSummaryUid(s.uid),
    onShowTodos: () => setTodoUid(s.uid),
    onShowProcesses: () => setProcUid(s.uid),
    onReopen: () => reopen(s.uid)
  })

  return (
    <div className="app">
      <header className="titlebar">
        <span className="wintitle">Session Deck</span>
        <span className="wincount">
          {running} running{waiting > 0 && ` · ${waiting} waiting`}
        </span>
        <span className="spacer" />
        {['available', 'downloading', 'ready'].includes(update.status) && (
          <button className="closeb titlebtn updatebtn" type="button" onClick={() => setUpdateOpen(true)}>
            {update.status === 'ready' ? 'Restart to update' : `Update to ${update.latest}`}
          </button>
        )}
        <button className="closeb titlebtn" type="button" onClick={() => setWorklogOpen(true)}>
          Worked on
        </button>
        <button className="closeb titlebtn" type="button" onClick={() => setAppearanceOpen(true)} title="Theme and text size">
          Appearance
        </button>
        <button className="newbtn" type="button" onClick={() => setPicking(true)}>
          + New session
        </button>
      </header>

      {launchError && (
        <div className="alertbar launcherror" role="alert">
          <div className="q">
            <b>Could not start the session</b>
            {launchError}
          </div>
          <button className="closeb" type="button" onClick={() => setLaunchError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="empty">
          <p>No sessions yet.</p>
          <button className="newbtn" type="button" onClick={() => setPicking(true)}>
            Start a session
          </button>
        </div>
      ) : (
        <div className="deck">
          {sessions.map((s) => (
            <SessionTile key={s.uid} session={s} lines={lines} onOpen={() => setFocusedUid(s.uid)} {...handlers(s)} />
          ))}
        </div>
      )}

      {picking && (
        <NewSession onPickSite={launch} onPickDirectory={launchDirectory} onClose={() => setPicking(false)} />
      )}
      {focused && (
        <FocusedSession
          session={focused}
          fontSize={TERM_FONT[settings.termFont] ?? TERM_FONT.medium}
          theme={`${settings.theme}:${settings.mode}`}
          onClose={() => setFocusedUid(null)}
          {...handlers(focused)}
        />
      )}
      {/* After the focused view, so a panel opened from it stacks on top. */}
      {summarySession && <SummaryPanel session={summarySession} onClose={() => setSummaryUid(null)} />}
      {diffSession && <DiffPanel session={diffSession} onClose={() => setDiffUid(null)} />}
      {todoSession && <ChecklistPanel session={todoSession} onClose={() => setTodoUid(null)} />}
      {procSession && <ProcessesPanel session={procSession} onClose={() => setProcUid(null)} />}
      {worklogOpen && <WorkLogPanel onClose={() => setWorklogOpen(false)} />}
      {updateOpen && <UpdatePanel state={update} running={sessions.filter((s) => s.attached).length} onClose={() => setUpdateOpen(false)} />}
      {appearanceOpen && (
        <Appearance
          settings={settings}
          onChange={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
          onClose={() => setAppearanceOpen(false)}
        />
      )}
      {linksSession && (
        <LinksPanel
          kind={links.kind}
          project={linksSession.project}
          projectKey={linksSession.projectKey}
          items={links.kind === 'prs' ? linksSession.pullRequests : linksSession.testPages}
          onClose={() => setLinks(null)}
        />
      )}
    </div>
  )
}
