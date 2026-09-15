import { ago } from '../lib/format.js'

/**
 * Every test page recorded for a project, newest first. These accumulate across
 * sessions and survive restarts, so this is also where they get tidied up.
 */
export default function TestPagesPanel({ project, projectKey, pages, onClose }) {
  const sorted = [...pages].sort((a, b) => b.at - a.at)

  const when = ago

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="picker pagespanel" role="dialog" aria-modal="true" aria-label="Test pages">
        <div className="fhead">
          <div>
            <div className="sname">Test pages</div>
            <div className="pname">
              {project.name} <s>•</s> {sorted.length} recorded
            </div>
          </div>
          <button className="closeb" type="button" onClick={onClose}>
            Esc · close
          </button>
        </div>

        <ul className="pagelist">
          {sorted.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="pageopen"
                onClick={() => window.deck.openExternal(p.url)}
                title={p.url}
              >
                <span className="pagetitle">{p.title}</span>
                <span className="pagemeta">
                  {when(p.at)} <s>•</s> {p.sessionName ?? 'unnamed session'} <s>•</s>{' '}
                  {p.url.replace(/^https?:\/\//, '')}
                </span>
              </button>
              <button
                className="closeb"
                type="button"
                title="Remove this link from the deck. The WordPress page is not deleted."
                onClick={() => window.deck.forgetTestPage(projectKey, p.id)}
              >
                Forget
              </button>
            </li>
          ))}
          {sorted.length === 0 && <li className="none">No test pages recorded yet.</li>}
        </ul>

        <p className="panelnote">
          “Forget” removes the link from Session Deck only — the page stays in
          WordPress. Delete it there if you want it gone.
        </p>
      </div>
    </div>
  )
}
