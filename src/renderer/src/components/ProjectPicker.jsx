import { useEffect, useState } from 'react'

export default function ProjectPicker({ onPick, onClose }) {
  const [projects, setProjects] = useState([])
  const [filter, setFilter] = useState('')

  useEffect(() => {
    window.deck.projects().then(setProjects)
  }, [])

  const shown = projects.filter((p) =>
    `${p.name} ${p.domain}`.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="picker" role="dialog" aria-modal="true" aria-label="Choose a Local site">
        <div className="fhead">
          <div className="sname">Choose a Local site</div>
          <button className="closeb" type="button" onClick={onClose}>
            Esc · close
          </button>
        </div>
        <input
          id="project-filter"
          className="filter"
          autoFocus
          placeholder="Filter sites…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <ul className="plist">
          {shown.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onPick(p.id)}>
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
    </div>
  )
}
