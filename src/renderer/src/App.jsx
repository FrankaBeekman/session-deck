import { useEffect, useState, useCallback } from 'react'
import SessionTile from './components/SessionTile.jsx'
import FocusedSession from './components/FocusedSession.jsx'
import NewSession from './components/NewSession.jsx'
import TestPagesPanel from './components/TestPagesPanel.jsx'
import DiffPanel from './components/DiffPanel.jsx'
import ChecklistPanel from './components/ChecklistPanel.jsx'
import ProcessesPanel from './components/ProcessesPanel.jsx'
import WorkLogPanel from './components/WorkLogPanel.jsx'

/** Tile height as a deck-wide setting: resizing tiles one by one in a grid
    leaves ragged rows, while a density keeps every row aligned. */
const DENSITIES = [
  { key: 'compact', label: 'S', lines: 4 },
  { key: 'comfortable', label: 'M', lines: 8 },
  { key: 'tall', label: 'L', lines: 14 }
]

function readDensity() {
  try {
    return localStorage.getItem('deck.density') ?? 'compact'
  } catch {
    return 'compact'
  }
}

export default function App() {
  const [sessions, setSessions] = useState([])
  // All selection keys on `uid`: a session's `id` can change underneath it.
  const [focusedUid, setFocusedUid] = useState(null)
  const [picking, setPicking] = useState(false)
  const [pagesUid, setPagesUid] = useState(null)
  const [diffUid, setDiffUid] = useState(null)
  const [todoUid, setTodoUid] = useState(null)
  const [procUid, setProcUid] = useState(null)
  const [worklogOpen, setWorklogOpen] = useState(false)
  const [density, setDensity] = useState(readDensity)

  useEffect(() => {
    window.deck.sessions().then(setSessions)
    return window.deck.onSessions(setSessions)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('deck.density', density)
    } catch {}
  }, [density])

  useEffect(() => {
    // Close the topmost layer only, so Esc in a panel opened from the focused
    // view returns to the terminal instead of dismissing both.
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (pagesUid) return setPagesUid(null)
      if (diffUid) return setDiffUid(null)
      if (todoUid) return setTodoUid(null)
      if (procUid) return setProcUid(null)
      if (worklogOpen) return setWorklogOpen(false)
      if (picking) return setPicking(false)
      setFocusedUid(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pagesUid, diffUid, todoUid, procUid, worklogOpen, picking])

  const reopen = useCallback(async (uid) => {
    const id = await window.deck.resume(uid)
    if (id) setFocusedUid(id)
  }, [])

  const launch = useCallback(async (projectId) => {
    setPicking(false)
    setFocusedUid(await window.deck.launch(projectId))
  }, [])

  const launchDirectory = useCallback(async (dir) => {
    setPicking(false)
    setFocusedUid(await window.deck.launchDirectory(dir))
  }, [])

  const byUid = (uid) => sessions.find((s) => s.uid === uid) ?? null
  const focused = byUid(focusedUid)
  const pagesSession = byUid(pagesUid)
  const diffSession = byUid(diffUid)
  const todoSession = byUid(todoUid)
  const procSession = byUid(procUid)
  const running = sessions.filter((s) => s.attached || (s.external && s.status !== 'closed')).length
  const waiting = sessions.filter((s) => s.status === 'needs-you').length
  const lines = (DENSITIES.find((d) => d.key === density) ?? DENSITIES[0]).lines

  const handlers = (s) => ({
    onShowPages: () => setPagesUid(s.uid),
    onShowDiff: () => setDiffUid(s.uid),
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
        <button className="closeb titlebtn" type="button" onClick={() => setWorklogOpen(true)}>
          Worked on
        </button>
        <div className="density" role="group" aria-label="Tile height">
          {DENSITIES.map((d) => (
            <button
              key={d.key}
              type="button"
              data-density={d.key}
              aria-pressed={density === d.key}
              title={`${d.key} tiles — ${d.lines} lines`}
              onClick={() => setDensity(d.key)}
            >
              {d.label}
            </button>
          ))}
        </div>
        <button className="newbtn" type="button" onClick={() => setPicking(true)}>
          + New session
        </button>
      </header>

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
      {focused && <FocusedSession session={focused} onClose={() => setFocusedUid(null)} {...handlers(focused)} />}
      {/* After the focused view, so a panel opened from it stacks on top. */}
      {diffSession && <DiffPanel session={diffSession} onClose={() => setDiffUid(null)} />}
      {todoSession && <ChecklistPanel session={todoSession} onClose={() => setTodoUid(null)} />}
      {procSession && <ProcessesPanel session={procSession} onClose={() => setProcUid(null)} />}
      {worklogOpen && <WorkLogPanel onClose={() => setWorklogOpen(false)} />}
      {pagesSession && (
        <TestPagesPanel
          project={pagesSession.project}
          projectKey={pagesSession.projectKey}
          pages={pagesSession.testPages}
          onClose={() => setPagesUid(null)}
        />
      )}
    </div>
  )
}
