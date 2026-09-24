import BranchIcon from './BranchIcon.jsx'

/**
 * The links and facts shown under a session — on its tile and in the focused
 * view alike, so the two cannot drift apart. `full` (the focused view) also
 * shows entry points that are empty, so you can add a to-do before there is one.
 */
export default function SessionMeta({ session, full = false, onShowPages, onShowPrs, onShowDiff, onShowSummary, onReopen, onShowTodos, onShowProcesses }) {
  const { testPages, branch, repoName, canReopen, attached, external, status, pullRequest, pullRequests, ticket, todos, processes, finished, appName } = session
  const latest = testPages.length ? testPages.reduce((a, b) => (b.at > a.at ? b : a)) : null
  const openTodos = todos.filter((t) => !t.done).length
  const act = (fn) => (e) => {
    e.preventDefault()
    e.stopPropagation()
    fn()
  }

  return (
    <span className="links">
      {ticket &&
        (ticket.url ? (
          <a href="#" className="ticketlink" title={ticket.url} onClick={act(() => window.deck.openExternal(ticket.url))}>
            {ticket.key}
          </a>
        ) : (
          <span className="ticketlink" title="Set a ticket URL in Settings to link this">
            {ticket.key}
          </span>
        ))}
      {branch && (
        <span className="branch" title={repoName ? `${branch} — ${repoName}` : branch}>
          <BranchIcon /> {branch}
        </span>
      )}
      {pullRequest && (
        <a href="#" title={pullRequest.title ? `${pullRequest.title}\n${pullRequest.url}` : pullRequest.url} onClick={act(() => window.deck.openExternal(pullRequest.url))}>
          PR ↗
        </a>
      )}
      {/* Same pattern as test pages: the latest links straight out, "all N" lists them. */}
      {pullRequests.length > 0 && (
        <a href="#" onClick={act(onShowPrs)} title="Pull requests reported for this project">
          {pullRequest ? `all ${pullRequests.length}` : `PRs (${pullRequests.length})`}
        </a>
      )}
      {latest ? (
        <>
          <a href="#" title={latest.url} onClick={act(() => window.deck.openExternal(latest.url))}>
            Test page ↗
          </a>
          <a href="#" onClick={act(onShowPages)} title="Test pages recorded for this project">
            all {testPages.length}
          </a>
        </>
      ) : (
        <span className="muted">no test page yet</span>
      )}
      <a href="#" onClick={act(onShowDiff)}>
        Diff
      </a>
      {full && (
        <a href="#" onClick={act(onShowSummary)} title="What this session did and where it stands">
          Summary
        </a>
      )}
      {(openTodos > 0 || full) && (
        <a href="#" className={openTodos ? 'todolink' : ''} onClick={act(onShowTodos)}>
          {openTodos ? `☐ ${openTodos} to-do${openTodos === 1 ? '' : 's'}` : 'To-dos'}
        </a>
      )}
      {(processes.length > 0 || (full && finished.length > 0)) && (
        <a href="#" className="proclink" onClick={act(onShowProcesses)} title="Shells Claude is running">
          {processes.length ? `⟳ ${processes.length} running` : 'Processes'}
        </a>
      )}
      {external && appName && (
        <a href="#" onClick={act(() => window.deck.focusApp(session.uid))} title={`Bring ${appName} to the front`}>
          Go to {appName} ↗
        </a>
      )}
      {!attached && !external && canReopen && (
        <a href="#" onClick={act(onReopen)}>
          {status === 'resumable' ? 'Resume ↻' : 'Reopen ↻'}
        </a>
      )}
    </span>
  )
}
