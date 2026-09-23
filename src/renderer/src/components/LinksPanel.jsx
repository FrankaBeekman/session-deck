import { ago } from '../lib/format.js'

/**
 * What each kind of link panel says. Both lists are kept per project, grow
 * across sessions and survive restarts, so this is also where they get tidied.
 */
const KINDS = {
  pages: {
    title: 'Test pages',
    counted: 'recorded',
    empty: 'No test pages recorded yet.',
    forgetTitle: 'Remove this link from the deck. The WordPress page is not deleted.',
    note: '“Forget” removes the link from Session Deck only — the page stays in WordPress. Delete it there if you want it gone.',
    label: (item) => item.title,
    forget: (projectKey, item) => window.deck.forgetTestPage(projectKey, item.id)
  },
  prs: {
    title: 'Pull requests',
    counted: 'reported',
    empty: 'No pull requests reported yet.',
    forgetTitle: 'Remove this link from the deck. The pull request itself is not touched.',
    note: '“Forget” removes the link from Session Deck only — the pull request stays open.',
    label: (item) => item.title || item.branch || item.url.replace(/^https?:\/\//, ''),
    forget: (projectKey, item) => window.deck.forgetPullRequest(projectKey, item.id)
  }
}

/** Every test page or pull request recorded for a project, newest first. */
export default function LinksPanel({ kind, project, projectKey, items, onClose }) {
  const k = KINDS[kind]
  const sorted = [...items].sort((a, b) => b.at - a.at)

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="picker pagespanel" role="dialog" aria-modal="true" aria-label={k.title}>
        <div className="fhead">
          <div>
            <div className="sname">{k.title}</div>
            <div className="pname">
              {project.name} <s>•</s> {sorted.length} {k.counted}
            </div>
          </div>
          <button className="closeb" type="button" onClick={onClose}>
            Esc · close
          </button>
        </div>

        <ul className="pagelist">
          {sorted.map((item) => (
            <li key={item.id}>
              <button type="button" className="pageopen" onClick={() => window.deck.openExternal(item.url)} title={item.url}>
                <span className="pagetitle">{k.label(item)}</span>
                <span className="pagemeta">
                  {ago(item.at)} <s>•</s> {item.sessionName ?? 'unnamed session'}
                  {item.branch && kind === 'prs' && item.title && (
                    <>
                      {' '}
                      <s>•</s> {item.branch}
                    </>
                  )}{' '}
                  <s>•</s> {item.url.replace(/^https?:\/\//, '')}
                </span>
              </button>
              <button className="closeb" type="button" title={k.forgetTitle} onClick={() => k.forget(projectKey, item)}>
                Forget
              </button>
            </li>
          ))}
          {sorted.length === 0 && <li className="none">{k.empty}</li>}
        </ul>

        <p className="panelnote">{k.note}</p>
      </div>
    </div>
  )
}
