import { useEffect, useState, useCallback } from 'react'

/** Colour a unified diff by line role. */
function DiffBody({ text, truncated }) {
  const lines = text.split('\n')
  return (
    <div className="diffbody">
      {lines.map((line, i) => {
        let cls = 'dl'
        if (line.startsWith('@@')) cls = 'dl dl--hunk'
        else if (line.startsWith('+++') || line.startsWith('---')) cls = 'dl dl--meta'
        else if (line.startsWith('diff --git') || line.startsWith('index ')) cls = 'dl dl--meta'
        else if (line.startsWith('new file') || line.startsWith('deleted file')) cls = 'dl dl--meta'
        else if (line.startsWith('+')) cls = 'dl dl--add'
        else if (line.startsWith('-')) cls = 'dl dl--del'
        return (
          <div key={i} className={cls}>
            {line || ' '}
          </div>
        )
      })}
      {truncated && <div className="dl dl--meta">… diff truncated (too large to display)</div>}
    </div>
  )
}

export default function DiffPanel({ session, onClose }) {
  const [repos, setRepos] = useState(null)
  const [selected, setSelected] = useState(null) // { root, path, untracked }
  const [diff, setDiff] = useState(null)

  useEffect(() => {
    let alive = true
    window.deck.gitRepos(session.id).then((r) => {
      if (!alive) return
      setRepos(r)
      const first = r.find((repo) => repo.files.length > 0)
      if (first) setSelected({ root: first.root, ...first.files[0] })
    })
    return () => {
      alive = false
    }
  }, [session.id])

  useEffect(() => {
    if (!selected) return
    let alive = true
    setDiff(null)
    window.deck
      .gitDiff(selected.root, selected.path, selected.untracked)
      .then((d) => alive && setDiff(d))
    return () => {
      alive = false
    }
  }, [selected])

  const isCurrent = useCallback(
    (root, f) => selected?.root === root && selected?.path === f.path,
    [selected]
  )

  const totalChanges = repos?.reduce((n, r) => n + r.files.length, 0) ?? 0

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="diffwin" role="dialog" aria-modal="true" aria-label="Changes">
        <div className="fhead">
          <div>
            <div className="sname">Changes</div>
            <div className="pname">
              {session.project.name}
              {repos !== null && (
                <>
                  {' '}
                  <s>•</s> {totalChanges} file{totalChanges === 1 ? '' : 's'} across{' '}
                  {repos.length} repo{repos.length === 1 ? '' : 's'}
                </>
              )}
            </div>
          </div>
          <button className="closeb" type="button" onClick={onClose}>
            Esc · close
          </button>
        </div>

        <div className="diffsplit">
          <div className="difffiles">
            {repos === null && <p className="none">Looking for repositories…</p>}
            {repos !== null && repos.length === 0 && (
              <p className="none">No git repositories with changes were found for this session.</p>
            )}
            {repos?.map((repo) => (
              <section key={repo.root} className="repogroup">
                <h3 title={repo.root}>
                  <span className="reponame">{repo.name}</span>
                  {repo.touched && <span className="badge">edited</span>}
                  {repo.branch && <span className="repobranch">{repo.branch}</span>}
                </h3>
                {repo.files.length === 0 ? (
                  <p className="none none--tight">no uncommitted changes</p>
                ) : (
                  <ul>
                    {repo.files.map((f) => (
                      <li key={f.path}>
                        <button
                          type="button"
                          className={isCurrent(repo.root, f) ? 'current' : ''}
                          onClick={() => setSelected({ root: repo.root, ...f })}
                          title={f.path}
                        >
                          <span className={`code code--${f.code === '?' ? 'u' : f.code}`}>
                            {f.code}
                          </span>
                          <span className="fpath">{f.path}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>

          <div className="diffpane">
            {!selected && <p className="none">Select a file to see its diff.</p>}
            {selected && diff === null && <p className="none">Loading diff…</p>}
            {selected && diff?.error && <p className="none">Could not diff: {diff.error}</p>}
            {selected && diff && !diff.error && diff.text.trim() === '' && (
              <p className="none">No textual changes (mode change, or binary file).</p>
            )}
            {selected && diff && !diff.error && diff.text.trim() !== '' && (
              <DiffBody text={diff.text} truncated={diff.truncated} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
