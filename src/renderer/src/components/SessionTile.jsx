import StatusPill from './StatusPill.jsx'

/** Only claim "permission" when the payload actually says so. */
function alertLabel(kind) {
  if (!kind || kind === 'unknown') return 'Needs your input'
  return /permission|approve|tool_use/i.test(kind) ? 'Permission requested' : 'Needs your input'
}

export default function SessionTile({ session, onOpen, onShowPages, onResume, onShowDiff }) {
  // Only offer dismissal where nothing is running — removing a live session
  // would kill it, which should stay a deliberate act inside the session view.
  const { status, project, name, activity, question, questionKind, testPages, external, resumable } =
    session
  const latest = testPages.length ? testPages.reduce((a, b) => (b.at > a.at ? b : a)) : null
  const removable = !session.attached
  const blocked = status === 'needs-you'

  return (
    <div
      className={`card${blocked ? ' alert' : ''}${status === 'closed' ? ' closed' : ''}${
        external ? ' external' : ''
      }`}
      role="button"
      tabIndex={0}
      onClick={resumable ? onResume : onOpen}
      onKeyDown={(e) =>
        (e.key === 'Enter' || e.key === ' ') &&
        (e.preventDefault(), resumable ? onResume() : onOpen())
      }
    >
      {removable && (
        <button
          className="dismiss"
          type="button"
          aria-label="Remove this session from the deck"
          title="Remove from deck"
          onClick={(e) => {
            e.stopPropagation()
            window.deck.remove(session.id)
          }}
        >
          ×
        </button>
      )}

      <div className="chead">
        <span className="sname">{name ?? 'Untitled session'}</span>
        <span className="pname">
          {project.name} <s>•</s> {project.domain}
          {external && <span className="badge" title="Started outside Session Deck">external</span>}
        </span>
      </div>

      {/* Four hook-derived lines. Not a terminal — see registry.js. */}
      <div className="term">
        {resumable ? (
          <span className="d">
            interrupted when Session Deck quit{'\n'}the conversation is intact — resume to reopen it
          </span>
        ) : activity.length === 0 ? (
          <span className="d">
            {external ? 'adopted — waiting for activity…' : 'waiting for first activity…'}
          </span>
        ) : (
          activity.map((line, i) => <div key={i}>{line}</div>)
        )}
      </div>

      <div className="cfoot">
        <StatusPill status={status} />
        <span className="links">
          {resumable ? (
            <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onResume() }}>
              Resume ↻
            </a>
          ) : latest ? (
            <>
              <a
                href="#"
                title={latest.url}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  window.deck.openExternal(latest.url)
                }}
              >
                Test page ↗
              </a>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onShowPages()
                }}
              >
                all {testPages.length}
              </a>
            </>
          ) : (
            <span>no test page yet</span>
          )}
          {!resumable && (
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onShowDiff()
              }}
            >
              Diff ↗
            </a>
          )}
        </span>
      </div>

      {blocked && (
        <div className="alertbar">
          <div className="q">
            <b>{alertLabel(questionKind)}</b>
            {question}
          </div>
          {/* Informational only, by design. The deck's job is to tell you which
              session needs you; answering happens in the session's own prompt,
              where the options are unambiguous. */}
          <span className="cue">{external ? 'answer in its terminal' : 'open to answer →'}</span>
        </div>
      )}
    </div>
  )
}
