import StatusPill from './StatusPill.jsx'
import SessionMeta from './SessionMeta.jsx'
import EditableName from './EditableName.jsx'

/** Only claim "permission" when the payload actually says so. */
export function alertLabel(kind) {
  if (!kind || kind === 'unknown') return 'Needs your input'
  return /permission|approve|tool_use/i.test(kind) ? 'Permission requested' : 'Needs your input'
}

/** What a tile without a terminal says instead of activity. */
export function detachedNote(session) {
  const why = session.status === 'resumable' ? 'interrupted when Session Deck quit' : 'session ended'
  const next = session.canReopen
    ? 'the conversation is saved — reopen to continue'
    : 'no saved conversation to reopen'
  return `${why}\n${next}`
}

export default function SessionTile({ session, lines, onOpen, ...handlers }) {
  const { status, project, activity, question, questionKind, external, attached } = session
  const blocked = status === 'needs-you'
  const detachedDeck = !attached && !external
  const cls = ['card', blocked && 'alert', status === 'closed' && 'closed', external && 'external', status === 'resumable' && 'resumable']
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={cls}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}
    >
      {!attached && (
        <button
          className="dismiss"
          type="button"
          aria-label="Remove this session from the deck"
          title="Remove from deck"
          onClick={(e) => {
            e.stopPropagation()
            window.deck.remove(session.uid)
          }}
        >
          ×
        </button>
      )}

      <div className="chead">
        <EditableName session={session} />
        <span className="pname">
          {project.name} <s>•</s> {project.domain}
          {external && <span className="badge" title="Started outside Session Deck">external</span>}
        </span>
      </div>

      {/* Hook-derived lines, not a terminal — see registry.js. */}
      <div className="term" style={{ '--lines': lines }}>
        {detachedDeck ? (
          <span className="d note">{detachedNote(session)}</span>
        ) : activity.length === 0 ? (
          <span className="d">{external ? 'adopted — waiting for activity…' : 'waiting for first activity…'}</span>
        ) : (
          activity.slice(-lines).map((line, i) => <div key={i}>{line}</div>)
        )}
      </div>

      <div className="cfoot">
        <StatusPill status={status} />
        {/* Every handler goes straight through, so a new panel can't be wired to
            the focused view and silently forgotten on the tile. */}
        <SessionMeta session={session} {...handlers} />
      </div>

      {blocked && (
        <div className="alertbar">
          <div className="q">
            <b>{alertLabel(questionKind)}</b>
            {question}
          </div>
          {/* Informational only, by design: answering happens in the session's
              own prompt, where the options are unambiguous. */}
          <span className="cue">{external ? 'answer in its terminal' : 'open to answer →'}</span>
        </div>
      )}
    </div>
  )
}
