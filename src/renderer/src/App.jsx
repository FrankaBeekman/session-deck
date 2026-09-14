import { useEffect, useState, useCallback } from 'react'
import SessionTile from './components/SessionTile.jsx'
import FocusedSession from './components/FocusedSession.jsx'
import ProjectPicker from './components/ProjectPicker.jsx'
import TestPagesPanel from './components/TestPagesPanel.jsx'
import DiffPanel from './components/DiffPanel.jsx'

export default function App() {
  const [sessions, setSessions] = useState([])
  const [focusedId, setFocusedId] = useState(null)
  const [picking, setPicking] = useState(false)
  const [pagesFor, setPagesFor] = useState(null)
  const [diffFor, setDiffFor] = useState(null)

  useEffect(() => {
    window.deck.sessions().then(setSessions)
    return window.deck.onSessions(setSessions)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setFocusedId(null)
        setPicking(false)
        setPagesFor(null)
        setDiffFor(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const resume = useCallback(async (sessionId) => {
    const id = await window.deck.resume(sessionId)
    if (id) setFocusedId(id)
  }, [])

  const launch = useCallback(async (projectId) => {
    setPicking(false)
    const id = await window.deck.launch(projectId)
    setFocusedId(id)
  }, [])

  const focused = sessions.find((s) => s.id === focusedId) ?? null
  const pagesSession = sessions.find((s) => s.id === pagesFor) ?? null
  const diffSession = sessions.find((s) => s.id === diffFor) ?? null
  const waiting = sessions.filter((s) => s.status === 'needs-you').length

  return (
    <div className="app">
      <header className="titlebar">
        <span className="wintitle">Session Deck</span>
        <span className="wincount">
          {sessions.length} active{waiting > 0 && ` · ${waiting} waiting`}
        </span>
        <span className="spacer" />
        <button className="newbtn" type="button" onClick={() => setPicking(true)}>
          + New session
        </button>
      </header>

      {sessions.length === 0 ? (
        <div className="empty">
          <p>No sessions yet.</p>
          <button className="newbtn" type="button" onClick={() => setPicking(true)}>
            Launch one in a Local site
          </button>
        </div>
      ) : (
        <div className="deck">
          {sessions.map((s) => (
            <SessionTile
              key={s.id}
              session={s}
              onOpen={() => setFocusedId(s.id)}
              onShowPages={() => setPagesFor(s.id)}
              onResume={() => resume(s.id)}
              onShowDiff={() => setDiffFor(s.id)}
            />
          ))}
        </div>
      )}

      {picking && <ProjectPicker onPick={launch} onClose={() => setPicking(false)} />}
      {pagesSession && (
        <TestPagesPanel
          project={pagesSession.project}
          projectKey={pagesSession.projectKey}
          pages={pagesSession.testPages}
          onClose={() => setPagesFor(null)}
        />
      )}
      {diffSession && <DiffPanel session={diffSession} onClose={() => setDiffFor(null)} />}
      {focused && <FocusedSession session={focused} onClose={() => setFocusedId(null)} />}
    </div>
  )
}
