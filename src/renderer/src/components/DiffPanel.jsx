import { useEffect, useState } from 'react'
import BranchIcon from './BranchIcon.jsx'
import SkinFrame from './SkinFrame.jsx'

const GROUPS = [
  { key: 'conflicted', label: 'Conflicted' },
  { key: 'staged', label: 'Staged' },
  { key: 'unstaged', label: 'Unstaged' },
  { key: 'untracked', label: 'Untracked' }
]

function DiffBody({ text, truncated }) {
  return (
    <div className="diffbody">
      {text.split('\n').map((line, i) => {
        let cls = 'dl'
        if (line.startsWith('@@')) cls += ' dl--hunk'
        else if (/^(\+\+\+|---|diff --git|index |new file|deleted file|similarity|rename )/.test(line)) cls += ' dl--meta'
        else if (line.startsWith('+')) cls += ' dl--add'
        else if (line.startsWith('-')) cls += ' dl--del'
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

const sameFile = (a, b) => a && b && a.root === b.root && a.path === b.path && a.group === b.group

export default function DiffPanel({ session, onClose }) {
  const [repos, setRepos] = useState(null)
  const [selected, setSelected] = useState(null)
  const [diff, setDiff] = useState(null)

  useEffect(() => {
    let alive = true
    window.deck.gitRepos(session.uid).then((r) => {
      if (!alive) return
      setRepos(r)
      const first = r.find((repo) => repo.files.length > 0)
      if (first) setSelected({ root: first.root, ...first.files[0] })
    })
    return () => {
      alive = false
    }
  }, [session.uid])

  useEffect(() => {
    if (!selected) return
    let alive = true
    setDiff(null)
    window.deck.gitDiff(selected.root, selected.path, selected.group).then((d) => alive && setDiff(d))
    return () => {
      alive = false
    }
  }, [selected])

  const paths = new Set(repos?.flatMap((r) => r.files.map((f) => `${r.root}\0${f.path}`)) ?? [])

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="diffwin" role="dialog" aria-modal="true" aria-label="Changes">
        <SkinFrame kind="dialog" />
        <div className="fhead">
          <div>
            <div className="sname">Changes</div>
            <div className="pname">
              {session.project.name}
              {repos !== null && (
                <>
                  {' '}
                  <s>•</s> {paths.size} file{paths.size === 1 ? '' : 's'} across {repos.length} repo
                  {repos.length === 1 ? '' : 's'}
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
            {repos?.length === 0 && <p className="none">No git repositories with changes were found for this session.</p>}
            {repos?.map((repo) => (
              <section key={repo.root} className="repogroup">
                <h3 title={repo.root}>
                  <span className="reponame">{repo.name}</span>
                  {repo.touched && <span className="badge">edited</span>}
                </h3>
                {repo.branch && (
                  <p className="repobranch" title={repo.branch}>
                    <BranchIcon /> {repo.branch}
                  </p>
                )}
                {repo.files.length === 0 && <p className="none none--tight">no uncommitted changes</p>}
                {GROUPS.map(({ key, label }) => {
                  const files = repo.files.filter((f) => f.group === key)
                  if (!files.length) return null
                  return (
                    <div key={key} className={`statusgroup statusgroup--${key}`}>
                      <h4>
                        {label} <span>{files.length}</span>
                      </h4>
                      <ul>
                        {files.map((f) => {
                          const item = { root: repo.root, ...f }
                          return (
                            <li key={`${key}:${f.path}`}>
                              <button
                                type="button"
                                className={sameFile(selected, item) ? 'current' : ''}
                                onClick={() => setSelected(item)}
                                title={`${f.label}: ${f.path}`}
                              >
                                <span className={`code code--${f.code === '?' ? 'u' : f.code}`}>{f.code}</span>
                                <span className="fpath">{f.path}</span>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )
                })}
              </section>
            ))}
          </div>

          <div className="diffpane">
            {selected && (
              <div className="diffcaption">
                <span className={`groupchip groupchip--${selected.group}`}>{selected.group}</span>
                <span className="fpath">{selected.path}</span>
              </div>
            )}
            {!selected && <p className="none">Select a file to see its diff.</p>}
            {selected && diff === null && <p className="none">Loading diff…</p>}
            {selected && diff?.error && <p className="none">Could not diff: {diff.error}</p>}
            {selected && diff && !diff.error && !diff.text.trim() && (
              <p className="none">No textual changes (mode change, or binary file).</p>
            )}
            {selected && diff && !diff.error && diff.text.trim() && (
              <DiffBody text={diff.text} truncated={diff.truncated} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
