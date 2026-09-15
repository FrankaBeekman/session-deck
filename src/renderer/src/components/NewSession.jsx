import { useEffect, useState } from 'react'

const TABS = [
  { key: 'site', label: 'Local site' },
  { key: 'directory', label: 'Directory' }
]

function readTab() {
  try {
    return localStorage.getItem('deck.newSessionTab') ?? 'site'
  } catch {
    return 'site'
  }
}

/** Start a session in a Local site, or in any directory. */
export default function NewSession({ onPickSite, onPickDirectory, onClose }) {
  const [tab, setTab] = useState(readTab)
  const [projects, setProjects] = useState([])
  const [recent, setRecent] = useState([])
  const [filter, setFilter] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    window.deck.projects().then(setProjects)
    window.deck.recentDirectories().then(setRecent)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('deck.newSessionTab', tab)
    } catch {}
  }, [tab])

  const choose = async () => {
    setError(null)
    const dir = await window.deck.chooseDirectory()
    if (dir) onPickDirectory(dir)
  }

  const shown = projects.filter((p) => `${p.name} ${p.domain}`.toLowerCase().includes(filter.toLowerCase()))

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="picker newsession" role="dialog" aria-modal="true" aria-labelledby="newsession-title">
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
                  <button type="button" onClick={() => onPickSite(p.id)}>
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
              {error && <p className="formerror">{error}</p>}
            </div>
            {recent.length > 0 && (
              <>
                <h4 className="listlabel">Recent</h4>
                <ul className="plist">
                  {recent.map((d) => (
                    <li key={d.path}>
                      <button type="button" onClick={() => onPickDirectory(d.path)} title={d.path}>
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
