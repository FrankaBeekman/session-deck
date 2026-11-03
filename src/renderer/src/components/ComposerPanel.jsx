import { useEffect, useMemo, useRef, useState } from 'react'
import { LockDiff, OpFooter, OpLog } from './ComposerOp.jsx'
// Pure rules shared with the main process, so the preview is the command it runs.
import { updateCommand } from '../../../main/composer-core.js'
import SkinFrame from './SkinFrame.jsx'
import { ago, ipcError } from '../lib/format.js'

/** One glyph per status, always next to its text — the shape carries it, not only the colour. */
const DOT = { 'not-merged': '○', untagged: '◑', behind: '◐', 'in-lock': '●' }
const DOT_LABEL = {
  'not-merged': 'not merged yet',
  untagged: 'merged, no release tag',
  behind: 'lock behind',
  'in-lock': 'in the lock'
}

/** On a tab: an update there that still wants something from you. */
const OP_MARK = { running: 'updating…', review: 'not committed', committed: 'not pushed', failed: 'failed' }

function Dot({ status }) {
  if (!DOT[status]) return null
  return (
    <span className={`cdot cdot--${status}`} aria-hidden="true">
      {DOT[status]}
    </span>
  )
}

/**
 * A locked version, with its commit when it tracks a branch, and how tightly
 * composer.json holds it: a pin is marked, a range is shown.
 */
function Locked({ pkg }) {
  if (!pkg.version) return <span className="muted">not in lock</span>
  return (
    <>
      {pkg.version}
      {pkg.version.startsWith('dev-') && pkg.ref && <span className="cref"> {pkg.ref}</span>}
    </>
  )
}

/**
 * What composer.json asks for, in its own column so it never reads as part of
 * the locked version: a pin marked, an open constraint flagged, the rest muted.
 */
function Constraint({ pkg }) {
  if (!pkg.constraint) return <span className="muted">—</span>
  if (pkg.pin === 'pinned') {
    return (
      <span title={`composer.json requires exactly ${pkg.constraint}; only editing composer.json changes it`}>
        {pkg.constraint}
        <span className="cpin">pinned</span>
      </span>
    )
  }
  if (pkg.pin === 'open') {
    return (
      <span className="cconstraint--open" title={`${pkg.constraint} has no upper limit: composer update can jump to a new major version`}>
        {pkg.constraint}
        <span className="copen">no upper limit</span>
      </span>
    )
  }
  return <span className="cconstraint">{pkg.constraint}</span>
}

/** Headers right above each list; "Other packages" has no status to head. */
function ColumnHead({ status = false }) {
  return (
    <div className="crow crowhead" aria-hidden="true">
      <span>Package</span>
      <span>Locked</span>
      <span>composer.json</span>
      <span>Newest</span>
      {status && <span>Status</span>}
    </div>
  )
}

/** `composer update` can't move a pinned package, so it can't be picked for one. */
const pinnedNote = (p) =>
  `Pinned to ${p.constraint} in composer.json. composer update keeps it there; changing it means editing composer.json.`

/** Newest for a ticket package comes from git; for the rest from "Check for updates". */
function Newest({ pkg, outdated }) {
  if (pkg.ticket && pkg.newest) {
    return (
      <span className="cnew">
        → {pkg.newest}
        {pkg.behindBy ? <span className="muted"> ({pkg.behindBy} commit{pkg.behindBy === 1 ? '' : 's'})</span> : null}
      </span>
    )
  }
  const o = outdated?.results?.[pkg.name]
  if (!o) return <span className="muted">—</span>
  if (o.status === 'up-to-date') return <span className="muted">up to date</span>
  const latest = String(o.latest ?? '').replace(/^dev-\S+\s+/, '')
  return (
    <span className={`cnew cnew--${o.status}`} title={o.status === 'update-possible' ? 'Outside the version constraint' : 'Within the version constraint'}>
      → {latest}
      {o.status === 'update-possible' && <span className="muted"> ({pkg.pin === 'pinned' ? 'pinned' : 'constraint'})</span>}
    </span>
  )
}

export default function ComposerPanel({ session, onClose }) {
  const [state, setState] = useState(null)
  const [tab, setTab] = useState(0)
  const [picked, setPicked] = useState({}) // branch -> Set of names
  const [onlyUpdates, setOnlyUpdates] = useState(false)
  const [checking, setChecking] = useState({}) // branch -> true
  const [checkError, setCheckError] = useState({}) // branch -> message
  const [ops, setOps] = useState({}) // branch -> state of an update there
  const [logOpen, setLogOpen] = useState({}) // branch -> bool
  const [diffOpen, setDiffOpen] = useState({}) // branch -> bool: the lock diff in place of the list
  const [hidePinned, setHidePinned] = useState(() => {
    try {
      return localStorage.getItem('deck.composer.hidePinned') === '1'
    } catch {
      return false
    }
  })
  const rootRef = useRef(null)

  const load = () => {
    setState(null)
    return window.deck
      .composerState(session.uid)
      .then((s) => {
        setState(s)
        if (!s.ok) return
        rootRef.current = s.root
        // An update can outlive the dialog (or the app): pick up where it is.
        for (const env of s.environments) {
          if (env.missing) continue
          window.deck
            .composerOp(session.uid, env.branch)
            .then((op) => setOps((o) => ({ ...o, [env.branch]: op })))
            .catch(() => {})
        }
        // The ticket's packages start selected on every environment — unless
        // pinned, which an update would leave where it is anyway.
        const next = {}
        for (const env of s.environments) {
          next[env.branch] = new Set(env.packages.filter((p) => p.ticket && p.pin !== 'pinned').map((p) => p.name))
        }
        setPicked(next)
        // Open on the first environment that still needs something.
        const first = s.environments.findIndex((e) => e.dot && e.dot !== 'in-lock')
        setTab(first >= 0 ? first : 0)
      })
      .catch((err) => setState({ ok: false, error: ipcError(err) }))
  }

  useEffect(() => {
    load()
  }, [session.uid])

  useEffect(
    () =>
      window.deck.onComposerOp((op) => {
        if (op.root !== rootRef.current) return
        setOps((o) => ({ ...o, [op.branch]: op }))
        // Nothing left to diff once the update is gone or pushed.
        if (op.stage === 'idle' || op.stage === 'pushed') setDiffOpen((d) => ({ ...d, [op.branch]: false }))
        // The log opens by itself while a step runs or when one fails, and
        // folds away again once things went well: it is one click away.
        if (op.stage === 'running' || op.stage === 'failed') setLogOpen((l) => ({ ...l, [op.branch]: true }))
        else if (['review', 'committed', 'pushed'].includes(op.stage) && !op.busy) setLogOpen((l) => ({ ...l, [op.branch]: false }))
      }),
    []
  )

  useEffect(() => {
    try {
      localStorage.setItem('deck.composer.hidePinned', hidePinned ? '1' : '0')
    } catch {}
  }, [hidePinned])

  const env = state?.ok ? state.environments[tab] : null
  const selected = (env && picked[env.branch]) ?? new Set()

  const toggle = (name) =>
    !env.packages.find((p) => p.name === name && p.pin === 'pinned') &&
    setPicked((prev) => {
      const set = new Set(prev[env.branch] ?? [])
      if (set.has(name)) set.delete(name)
      else set.add(name)
      return { ...prev, [env.branch]: set }
    })

  const check = async () => {
    const branch = env.branch
    setChecking((c) => ({ ...c, [branch]: true }))
    setCheckError((e) => ({ ...e, [branch]: null }))
    try {
      const r = await window.deck.composerOutdated(session.uid, branch)
      if (r.ok) {
        setState((s) => ({
          ...s,
          environments: s.environments.map((e) => (e.branch === branch ? { ...e, outdated: { at: r.at, results: r.results } } : e))
        }))
      } else {
        setCheckError((e) => ({ ...e, [branch]: r.error }))
      }
    } catch (err) {
      setCheckError((e) => ({ ...e, [branch]: ipcError(err) }))
    } finally {
      setChecking((c) => ({ ...c, [branch]: false }))
    }
  }

  const changeWorkflow = async (id) => {
    await window.deck.setProjectWorkflow(session.uid, id || null)
    load()
  }

  const ticketRows = env?.packages.filter((p) => p.ticket) ?? []
  const otherRows = useMemo(() => {
    let rows = env?.packages.filter((p) => !p.ticket) ?? []
    if (hidePinned) rows = rows.filter((p) => p.pin !== 'pinned')
    if (!onlyUpdates || !env?.outdated) return rows
    return rows.filter((p) => {
      const o = env.outdated.results[p.name]
      return o && o.status !== 'up-to-date'
    })
  }, [env, onlyUpdates, hidePinned])

  const pinnedCount = env?.packages.filter((p) => !p.ticket && p.pin === 'pinned').length ?? 0

  // Selection order follows the list, so the command reads the same every time.
  const names = env?.packages.filter((p) => selected.has(p.name)).map((p) => p.name) ?? []
  const command = updateCommand(names)

  const op = env ? ops[env.branch] : null
  // While an update is under way on this branch, the selection is what it runs.
  const locked = op && op.stage !== 'idle'

  const row = (p) => (
    <li key={p.name} className={`crow ${p.ticket ? 'crow--ticket' : ''} ${p.pin === 'pinned' ? 'crow--pinned' : ''}`}>
      <label title={p.pin === 'pinned' ? pinnedNote(p) : undefined}>
        <input
          type="checkbox"
          checked={locked ? op.packages.includes(p.name) : selected.has(p.name)}
          disabled={p.pin === 'pinned' || locked}
          aria-describedby={p.pin === 'pinned' ? `pin-${p.name}` : undefined}
          onChange={() => toggle(p.name)}
        />
        {p.pin === 'pinned' && (
          <span id={`pin-${p.name}`} className="visually-hidden">
            {pinnedNote(p)}
          </span>
        )}
        <span
          className="cname"
          title={p.ticket ? (p.via === 'branch' ? `${p.name} — has a branch for ${state.ticket}` : `${p.name} — edited in a session`) : p.name}
        >
          {p.name}
        </span>
      </label>
      <span className="clocked">
        <Locked pkg={p} />
      </span>
      <span className="cconstraintcol">
        <Constraint pkg={p} />
      </span>
      <span className="cnewcol">
        <Newest pkg={p} outdated={env.outdated} />
      </span>
      {!p.ticket && <span />}
      {p.ticket && (
        <span className={`cstatus cstatus--${p.status}`} title={p.branches > 1 ? `${p.branches} branches for this ticket` : p.tip ?? undefined}>
          <Dot status={p.status} /> {p.text}
        </span>
      )}
    </li>
  )

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="diffwin composerwin" role="dialog" aria-modal="true" aria-labelledby="composer-title">
        <SkinFrame kind="dialog" />
        <div className="fhead">
          <div className="composerhead">
            <div className="sname" id="composer-title">
              Composer{state?.ticket ? ` — ${state.ticket}` : ''}
            </div>
            <div className="pname">
              {state?.ok ? <span title={state.root}>{state.root.split(/[\\/]/).slice(-2).join('/')}</span> : session.project.name}
              {state?.ok && (
                <>
                  {' '}
                  <s>•</s>{' '}
                  <label className="cworkflow">
                    Workflow{' '}
                    <select value={state.workflow.source === 'project' ? state.workflow.id : ''} onChange={(e) => changeWorkflow(e.target.value)}>
                      <option value="">
                        Default ({state.workflows.find((w) => w.id === state.defaultWorkflowId)?.name ?? 'none'})
                      </option>
                      {state.workflows.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
          </div>
          <button className="closeb" type="button" onClick={onClose}>
            Esc · close
          </button>
        </div>

        {state === null && <p className="none">Reading the lock files…</p>}
        {state && !state.ok && <p className="none">{state.error}</p>}

        {state?.ok && state.environments.length === 0 && (
          <p className="none">No environments: the project repo has no branch checked out. Pick a workflow above.</p>
        )}

        {state?.ok && state.environments.length > 0 && (
          <>
            <div className="ctabs" role="tablist" aria-label="Environments">
              {state.environments.map((e, i) => (
                <button
                  key={e.branch}
                  type="button"
                  role="tab"
                  aria-selected={i === tab}
                  className={e.missing ? 'ctab--missing' : ''}
                  onClick={() => setTab(i)}
                  title={
                    e.missing
                      ? `No ${e.branch} branch in this project`
                      : !e.onRemote
                        ? `${e.branch} exists only locally; push it before updating its lock here`
                        : e.dot
                          ? DOT_LABEL[e.dot]
                          : undefined
                  }
                >
                  <Dot status={e.dot} />
                  <span className="ctablabel">{e.label}</span>
                  {e.label !== e.branch && <span className="ctabbranch">{e.branch}</span>}
                  {e.pending && <span className="ctabbranch">not in this workflow</span>}
                  {OP_MARK[ops[e.branch]?.stage] && (
                    <span className={`ctabop ctabop--${ops[e.branch].stage}`}>{OP_MARK[ops[e.branch].stage]}</span>
                  )}
                </button>
              ))}
            </div>

            <div className="cbody" role="tabpanel">
              {state.warnings.map((w) => (
                <p key={w} className="cwarn">
                  {w}
                </p>
              ))}
              {env.missing && <p className="none">This project has no <code>{env.branch}</code> branch. Pick another workflow for it above.</p>}
              {env.error && <p className="none">Could not read the lock on {env.branch}: {env.error}</p>}

              {!env.missing && !env.error && diffOpen[env.branch] && op && <LockDiff session={session} op={op} />}
              {!env.missing && !env.error && !diffOpen[env.branch] && (
                <>
                  <section className="cgroup">
                    <h3>{state.ticket ? 'Changed in this ticket' : 'Changed in this session'}</h3>
                    {ticketRows.length === 0 && (
                      <p className="none none--tight">
                        {state.ticket
                          ? `No installed package has a ${state.ticket} branch, and none was edited in a session on this ticket`
                          : 'No package was edited in this session'}
                        {state.unmatched.length > 0 && ` that matches the lock (found: ${state.unmatched.join(', ')})`}.
                      </p>
                    )}
                    {ticketRows.length > 0 && <ColumnHead status />}
                    <ul>{ticketRows.map(row)}</ul>
                  </section>

                  <section className="cgroup">
                    <h3 className="cgrouphead">
                      Other packages
                      <span className="cchecks">
                        <label
                          className={pinnedCount ? '' : 'disabled'}
                          title={
                            pinnedCount
                              ? 'Pinned to one exact version in composer.json; composer update leaves these alone'
                              : `No package is pinned to one exact version in composer.json on ${env.branch}`
                          }
                        >
                          <input
                            type="checkbox"
                            checked={hidePinned && pinnedCount > 0}
                            disabled={!pinnedCount}
                            onChange={(e) => setHidePinned(e.target.checked)}
                          />{' '}
                          {pinnedCount ? `hide ${pinnedCount} pinned` : 'hide pinned (none here)'}
                        </label>
                        <button className="closeb" type="button" onClick={check} disabled={checking[env.branch]}>
                          {checking[env.branch] ? 'Checking…' : 'Check for updates'}
                        </button>
                        {env.outdated && !checking[env.branch] && <span className="muted">checked {ago(env.outdated.at)}</span>}
                        <label className={env.outdated ? '' : 'disabled'}>
                          <input type="checkbox" checked={onlyUpdates} disabled={!env.outdated} onChange={(e) => setOnlyUpdates(e.target.checked)} /> only with updates
                        </label>
                      </span>
                    </h3>
                    {checking[env.branch] && <p className="none none--tight">Composer is checking every repository; this can take a minute.</p>}
                    {checkError[env.branch] && <pre className="cerror">{checkError[env.branch]}</pre>}
                    {otherRows.length > 0 && <ColumnHead />}
                    <ul>{otherRows.map(row)}</ul>
                  </section>
                </>
              )}
            </div>

            {op && logOpen[env.branch] && <OpLog op={op} />}
            {!env.missing && !env.error && (
              <OpFooter
                key={env.branch}
                op={op}
                session={session}
                env={env}
                names={names}
                command={command}
                logOpen={Boolean(logOpen[env.branch])}
                diffOpen={Boolean(diffOpen[env.branch])}
                onToggleDiff={() => setDiffOpen((d) => ({ ...d, [env.branch]: !d[env.branch] }))}
                onToggleLog={() => setLogOpen((l) => ({ ...l, [env.branch]: !l[env.branch] }))}
                onPushed={async () => {
                  await window.deck.composerDiscard(session.uid, env.branch)
                  load()
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
