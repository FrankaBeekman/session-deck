import { useEffect, useState } from 'react'
import { ago, ipcError } from '../lib/format.js'
import SkinFrame from './SkinFrame.jsx'

const TABS = [
  { key: 'site', label: 'Local site' },
  { key: 'directory', label: 'Directory' },
  { key: 'resume', label: 'Resume' }
]

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

function readTab() {
  try {
    return localStorage.getItem('deck.newSessionTab') ?? 'site'
  } catch {
    return 'site'
  }
}

/** Start a session in a Local site or any directory, or resume a conversation. */
export default function NewSession({ onPickSite, onPickDirectory, onResume, onClose }) {
  const [tab, setTab] = useState(readTab)
  const [projects, setProjects] = useState([])
  const [recent, setRecent] = useState([])
  const [conversations, setConversations] = useState(null)
  const [resumeInput, setResumeInput] = useState('')
  const [filter, setFilter] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    window.deck.projects().then(setProjects)
    window.deck.recentDirectories().then(setRecent)
  }, [])

  // Reads transcript heads from disk, so only when the tab is actually opened.
  useEffect(() => {
    if (tab === 'resume' && conversations === null) window.deck.conversations().then(setConversations)
  }, [tab, conversations])

  useEffect(() => {
    try {
      localStorage.setItem('deck.newSessionTab', tab)
    } catch {}
  }, [tab])

  // A failed launch keeps the picker open with the reason, rather than closing
  // it and leaving no tile and no explanation.
  const start = async (fn) => {
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(ipcError(err))
    }
  }

  const choose = () =>
    start(async () => {
      const dir = await window.deck.chooseDirectory()
      if (dir) await onPickDirectory(dir)
    })

  // The field takes an id or the whole `claude --resume <id>` line; anything
  // else filters the list.
  const pastedId = resumeInput.match(UUID)?.[0] ?? null
  const needle = pastedId ? '' : resumeInput.trim().toLowerCase()
  const shownConversations = (conversations ?? []).filter((c) =>
    `${c.name ?? ''} ${c.display} ${c.site ?? ''} ${c.id}`.toLowerCase().includes(needle)
  )
  const resumePasted = (e) => {
    e.preventDefault()
    if (pastedId) start(() => onResume(pastedId))
  }

  const shown = projects.filter((p) => `${p.name} ${p.domain}`.toLowerCase().includes(filter.toLowerCase()))

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="picker newsession" role="dialog" aria-modal="true" aria-labelledby="newsession-title">
        <SkinFrame kind="dialog" />
        <div className="fhead">
          <div className="sname" id="newsession-title">
            New session
          </div>
          <button className="closeb" type="button" onClick={onClose}>
            Esc · close
          </button>
        </div>

        <div className="tabs" role="tablist" aria-label="Where to start">
          {TABS.map((t) => (
            <button
              key={t.key}
              id={`tab-${t.key}`}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              aria-controls={`panel-${t.key}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <p className="formerror launchfail" role="alert">
            {error}
          </p>
        )}

        {tab === 'site' ? (
          <div className="tabpanel" id="panel-site" role="tabpanel" aria-labelledby="tab-site">
            <input
              id="project-filter"
              className="filter"
              autoFocus
              placeholder="Filter sites…"
              aria-label="Filter Local sites"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <ul className="plist">
              {shown.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => start(() => onPickSite(p.id))}>
                    <span className="sname">{p.name}</span>
                    <span className="pname">
                      {p.domain} <s>•</s> PHP {p.phpVersion}
                    </span>
                  </button>
                </li>
              ))}
              {shown.length === 0 && <li className="none">No sites match.</li>}
            </ul>
          </div>
        ) : tab === 'resume' ? (
          <div className="tabpanel" id="panel-resume" role="tabpanel" aria-labelledby="tab-resume">
            <form className="resumeform" onSubmit={resumePasted}>
              <input
                id="resume-input"
                className="filter"
                autoFocus
                placeholder="Paste a session id or claude --resume …, or filter"
                aria-label="Session id to resume, or filter conversations"
                aria-describedby="resume-hint"
                value={resumeInput}
                onChange={(e) => setResumeInput(e.target.value)}
              />
              <button className="newbtn" type="submit" disabled={!pastedId}>
                Resume
              </button>
            </form>
            <p className="resumehint" id="resume-hint">
              Claude prints the id when it stops. The session reopens in the folder it ran in.
            </p>
            <h4 className="listlabel">Recent conversations</h4>
            <ul className="plist">
              {conversations === null && <li className="none">Loading…</li>}
              {shownConversations.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => start(() => onResume(c.id))} title={`${c.cwd}\n${c.id}`}>
                    <span className="sname">{c.name ?? 'Untitled conversation'}</span>
                    <span className="pname">
                      <span className="dirpath">{c.display}</span> <s>•</s> {ago(c.at)}
                      {c.site && <span className="badge">Local · {c.site}</span>}
                      {c.open && <span className="badge">Open</span>}
                    </span>
                  </button>
                </li>
              ))}
              {conversations !== null && shownConversations.length === 0 && (
                <li className="none">No conversations match.</li>
              )}
            </ul>
          </div>
        ) : (
          <div className="tabpanel" id="panel-directory" role="tabpanel" aria-labelledby="tab-directory">
            <div className="choosedir">
              <button className="newbtn" type="button" onClick={choose} autoFocus>
                Choose a folder…
              </button>
              <p>
                Inside a Local site, the session still gets that site’s shell — WP-CLI and the
                right PHP — just started in the folder you pick.
              </p>
            </div>
            {recent.length > 0 && (
              <>
                <h4 className="listlabel">Recent</h4>
                <ul className="plist">
                  {recent.map((d) => (
                    <li key={d.path}>
                      <button type="button" onClick={() => start(() => onPickDirectory(d.path))} title={d.path}>
                        <span className="sname">{d.name}</span>
                        <span className="pname">
                          <span className="dirpath">{d.display}</span>
                          {d.site && <span className="badge">Local · {d.site}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
