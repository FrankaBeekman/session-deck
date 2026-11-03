import { useEffect, useRef, useState } from 'react'
import { duration, ipcError } from '../lib/format.js'
import { DiffBody } from './DiffPanel.jsx'

/**
 * The update itself, for one environment: the footer that walks through
 * update → review → commit → push, and the log of every step underneath.
 * Commit and push are separate clicks; nothing happens without one.
 */

function StepLine({ s, open, onToggle }) {
  const state = s.code === null ? 'running' : s.code === 0 ? 'ok' : 'failed'
  const mark = { running: '…', ok: '✓', failed: '✗' }[state]
  const took = s.endedAt ? duration(s.endedAt - s.startedAt) : null
  return (
    <li className={`cstep cstep--${state}`}>
      <button type="button" className="cstephead" aria-expanded={open} onClick={onToggle}>
        <span className="cstepmark" aria-hidden="true">
          {mark}
        </span>
        <span className="csteptitle">{s.title}</span>
        <code className="cstepcmd">{s.cmd}</code>
        <span className="cstepmeta">
          {state === 'failed' && `exit ${s.code} · `}
          {took ?? 'running'}
        </span>
        <span className="visually-hidden">{state === 'ok' ? 'succeeded' : state === 'failed' ? 'failed' : 'running'}</span>
      </button>
      {open && (
        <pre className="cstepout">
          {s.truncated && '… (earlier output cut)\n'}
          {s.output.trim() || '(no output)'}
        </pre>
      )}
    </li>
  )
}

/** Says where the work happens, every time it could be in doubt. */
function WorktreeNote({ op, branch }) {
  const [copied, setCopied] = useState(false)
  const remoteBranch = `${op?.remote ?? 'origin'}/${branch}`
  return (
    <p className="cwtnote">
      Runs in a separate worktree, detached at {remoteBranch}; your own checkout stays untouched.
      {op?.worktree && (
        <button
          className="linkbtn"
          type="button"
          title={op.worktree}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(op.worktree)
              setCopied(true)
              setTimeout(() => setCopied(false), 1400)
            } catch {}
          }}
        >
          {copied ? 'Copied' : 'Copy path'}
        </button>
      )}
    </p>
  )
}

/**
 * The full diff of what the worktree holds against the remote branch — the
 * lock, and anything else a fix touched. Shown in place of the package list.
 */
export function LockDiff({ session, op }) {
  const [diff, setDiff] = useState(null)
  const key = `${op.stage}:${op.commit?.sha ?? ''}:${op.steps.length}`
  useEffect(() => {
    let alive = true
    setDiff(null)
    window.deck
      .composerDiff(session.uid, op.branch)
      .then((d) => alive && setDiff(d))
      .catch((err) => alive && setDiff({ error: ipcError(err) }))
    return () => {
      alive = false
    }
  }, [session.uid, op.branch, key])

  if (diff === null) return <p className="none">Loading the diff…</p>
  if (diff.error) return <p className="none">Could not read the diff: {diff.error}</p>
  if (!diff.text.trim())
    return (
      <p className="none">
        No differences from {op.remote}/{op.branch}.
      </p>
    )
  return (
    <div className="clockdiff">
      <p className="cdiffcaption">
        Worktree against{' '}
        <code>
          {op.remote}/{op.branch}
        </code>
      </p>
      <div className="diffscroll">
        <DiffBody text={diff.text} truncated={diff.truncated} />
      </div>
    </div>
  )
}

/** Failed and running steps open by themselves; a click overrides either way. */
export function OpLog({ op }) {
  const [toggled, setToggled] = useState({})
  const end = useRef(null)
  const running = op.steps.some((s) => s.code === null)
  const lastOutput = op.steps.at(-1)?.output.length ?? 0

  useEffect(() => {
    if (running) end.current?.scrollIntoView({ block: 'nearest' })
  }, [running, lastOutput])

  if (!op.steps.length) return null
  return (
    <div className="clog" aria-label={`Log for ${op.branch}`}>
      <ol>
        {op.steps.map((s) => {
          const auto = s.code === null || (s.code !== 0 && s.id === op.failed?.stepId)
          const open = toggled[s.id] ?? auto
          return <StepLine key={s.id} s={s} open={open} onToggle={() => setToggled((t) => ({ ...t, [s.id]: !open }))} />
        })}
      </ol>
      <div ref={end} />
    </div>
  )
}

export function OpFooter({ op, session, env, names, command, logOpen, onToggleLog, diffOpen, onToggleDiff, onPushed }) {
  const [message, setMessage] = useState('')
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(null) // 'command' | 'prompt' | 'pasted'
  const branch = env.branch
  const remoteBranch = `${op?.remote ?? 'origin'}/${branch}`

  useEffect(() => {
    if (op?.stage === 'review') setMessage(op.review?.message ?? '')
  }, [op?.stage, op?.review?.message])

  const act = (fn) => async () => {
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(ipcError(err))
    }
  }
  const flash = (what) => {
    setCopied(what)
    setTimeout(() => setCopied(null), 1400)
  }
  const copyText = async (text, what) => {
    try {
      await navigator.clipboard.writeText(text)
      flash(what)
    } catch {}
  }

  const stage = op?.stage ?? 'idle'
  const diffButton = (
    <button className="closeb" type="button" aria-pressed={diffOpen} onClick={onToggleDiff}>
      {diffOpen ? 'Back to packages' : 'Show lock diff'}
    </button>
  )
  const logButton = op?.steps.length ? (
    <button className="closeb" type="button" aria-expanded={logOpen} onClick={onToggleLog}>
      {logOpen ? 'Hide log' : `Log (${op.steps.length})`}
    </button>
  ) : null

  return (
    <div className={`ffoot cfoot cfoot--${stage}`}>
      {error && (
        <p className="cerrline" role="alert">
          {error}
        </p>
      )}

      {stage === 'idle' && (
        <div className="cfootrow">
          {op?.note && <p className="cnote">{op.note}</p>}
          {command && <WorktreeNote op={op} branch={branch} />}
          {command && !env.onRemote && (
            <p className="cnote">
              {branch} is not on {op?.remote ?? 'the remote'} yet, so its lock can't be updated here. Push the branch first.
            </p>
          )}
          {command ? (
            <>
              <code className="ccommand" title={`Runs on ${branch}, in a separate worktree`}>
                {command}
              </code>
              <button className="closeb" type="button" onClick={() => copyText(command, 'command')}>
                {copied === 'command' ? 'Copied' : 'Copy'}
              </button>
              <button
                className="newbtn"
                type="button"
                disabled={!env.onRemote}
                onClick={act(() => window.deck.composerUpdate(session.uid, branch, names))}
              >
                Update lock on {branch}
              </button>
            </>
          ) : (
            <span className="muted">Select packages to update on {branch}.</span>
          )}
          {logButton}
        </div>
      )}

      {stage === 'running' && (
        <div className="cfootrow" aria-live="polite">
          <span className="cbusy">{op.steps.findLast((s) => s.code === null)?.title ?? 'Working'}…</span>
          {logButton}
        </div>
      )}

      {stage === 'review' && op.review && (
        <div className="creview">
          <h3>
            composer.lock on {branch}
            <span className="muted"> · not committed yet</span>
          </h3>
          <WorktreeNote op={op} branch={branch} />
          {op.note && <p className="cnote">{op.note}</p>}
          {!diffOpen && (
            <ul className="cchanges">
              {op.review.changes.map((c) => (
                <li key={c.name}>
                  <span className="cname">{c.name}</span>
                  <code>
                    {c.from ?? 'new'} → {c.to ?? 'removed'}
                  </code>
                </li>
              ))}
            </ul>
          )}
          {op.review.unexpected.length > 0 && (
            <p className="cwarn">
              Also changed, though not selected: {op.review.unexpected.join(', ')}. A shared dependency usually; check it is
              wanted.
            </p>
          )}
          {op.review.otherFiles.length > 0 && (
            <p className="cwarn">Besides the lock, these changed too and will be committed: {op.review.otherFiles.join(', ')}.</p>
          )}
          <label className="cmessage">
            Commit message
            <input className="filter" value={message} onChange={(e) => setMessage(e.target.value)} spellCheck={false} />
          </label>
          <div className="cfootrow">
            <button className="closeb" type="button" onClick={act(() => window.deck.composerDiscard(session.uid, branch))}>
              Discard
            </button>
            {diffButton}
            {logButton}
            <button
              className="newbtn"
              type="button"
              disabled={!message.trim()}
              onClick={act(() => window.deck.composerCommit(session.uid, branch, message))}
            >
              Commit to {branch}
            </button>
          </div>
        </div>
      )}

      {stage === 'committed' && op.commit && (
        <div className="creview">
          <h3>
            Ready to push
            <span className="muted">
              {' '}
              · {op.commit.ahead} commit{op.commit.ahead === 1 ? '' : 's'} to {remoteBranch}
            </span>
          </h3>
          <WorktreeNote op={op} branch={branch} />
          {op.note && <p className="cnote">{op.note}</p>}
          <p className="ccommit">
            <code>{op.commit.sha}</code> {op.commit.message}
          </p>
          <div className="cfootrow">
            <button className="closeb" type="button" onClick={act(() => window.deck.composerUndoCommit(session.uid, branch))}>
              Undo commit
            </button>
            {diffButton}
            {logButton}
            <button className="newbtn" type="button" onClick={act(() => window.deck.composerPush(session.uid, branch))}>
              Push to {remoteBranch}
            </button>
          </div>
        </div>
      )}

      {stage === 'pushed' && (
        <div className="cfootrow" aria-live="polite">
          <span className="cdone">
            <span aria-hidden="true">✓</span> Pushed to {remoteBranch}
            {op.commit && (
              <>
                {' '}
                — <code>{op.commit.sha}</code> {op.commit.message}
              </>
            )}
          </span>
          {logButton}
          <button className="newbtn" type="button" onClick={act(onPushed)}>
            Done
          </button>
        </div>
      )}

      {stage === 'failed' && (
        <div className="creview creview--failed">
          <p className="cerrline" role="alert">
            <span aria-hidden="true">✗</span> {op.failed?.message}
          </p>
          <div className="cfootrow">
            <button className="closeb" type="button" onClick={act(() => window.deck.composerDiscard(session.uid, branch))}>
              Discard
            </button>
            {logButton}
            <button
              className="closeb"
              type="button"
              onClick={act(async () => copyText(await window.deck.composerPrompt(session.uid, branch), 'prompt'))}
            >
              {copied === 'prompt' ? 'Copied' : 'Copy prompt for Claude'}
            </button>
            {session.attached && (
              <button
                className="closeb"
                type="button"
                title="Types the prompt into this session without sending it; you read it, then press Enter"
                onClick={act(async () => (await window.deck.composerPaste(session.uid, branch)) && flash('pasted'))}
              >
                {copied === 'pasted' ? 'Pasted, not sent' : 'Paste into session'}
              </button>
            )}
            <button className="newbtn" type="button" onClick={act(() => window.deck.composerRetry(session.uid, branch))}>
              Retry
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
