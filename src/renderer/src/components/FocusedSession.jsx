import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import StatusPill from './StatusPill.jsx'
import SessionMeta from './SessionMeta.jsx'
import EditableName from './EditableName.jsx'
import { alertLabel, detachedNote } from './SessionTile.jsx'

const SIZE_KEY = 'deck.focusedSize'

function savedSize() {
  try {
    return JSON.parse(localStorage.getItem(SIZE_KEY)) ?? null
  } catch {
    return null
  }
}

/**
 * The only real terminal emulator in the app, mounted on focus and disposed on
 * close. The dialog is large by default and drag-resizable from its corner; the
 * terminal refits to it and the PTY is resized only when the grid actually
 * changes, so Claude's TUI re-flows on a deliberate resize, never on open.
 * Everything the tile shows is shown here too.
 *
 * The terminal keys on `uid`, not `id`: Claude's session id can change while the
 * terminal is open (resume fallback, /clear), and remounting would flicker and
 * drop scroll position.
 */
export default function FocusedSession({ session, onClose, onShowPages, onShowDiff, onReopen, onShowTodos, onShowProcesses }) {
  const hostRef = useRef(null)
  const dialogRef = useRef(null)
  const initialSize = useRef(savedSize())

  // Remember the size the user dragged the dialog to.
  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    let t
    const ro = new ResizeObserver(() => {
      clearTimeout(t)
      t = setTimeout(() => {
        try {
          localStorage.setItem(SIZE_KEY, JSON.stringify({ width: el.offsetWidth, height: el.offsetHeight }))
        } catch {}
      }, 250)
    })
    ro.observe(el)
    return () => {
      clearTimeout(t)
      ro.disconnect()
    }
  }, [])
  const detached = !session.attached
  const blocked = session.status === 'needs-you'

  useEffect(() => {
    if (detached) return
    let term
    let offData
    let ro
    let timer
    let disposed = false

    ;(async () => {
      const { cols, rows } = await window.deck.ptySize(session.uid)
      if (disposed) return
      term = new Terminal({
        cols,
        rows,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 12,
        theme: { background: '#100e0f', foreground: '#cdc4c9' },
        cursorBlink: true,
        scrollback: 5000
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.open(hostRef.current)
      term.write(await window.deck.buffer(session.uid))
      term.focus()

      const refit = () => {
        if (disposed) return
        const dims = fit.proposeDimensions()
        if (!dims?.cols || !dims?.rows) return
        if (dims.cols === term.cols && dims.rows === term.rows) return
        term.resize(dims.cols, dims.rows)
        window.deck.resize(session.uid, dims.cols, dims.rows)
      }
      requestAnimationFrame(refit)
      ro = new ResizeObserver(() => {
        clearTimeout(timer)
        timer = setTimeout(refit, 120)
      })
      ro.observe(hostRef.current)
      term.onData((data) => window.deck.write(session.uid, data))
      offData = window.deck.onData(({ sessionId, chunk }) => {
        if (sessionId === session.uid) term.write(chunk)
      })
    })()

    return () => {
      disposed = true
      clearTimeout(timer)
      ro?.disconnect()
      offData?.()
      term?.dispose()
    }
  }, [session.uid, detached])

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="focused"
        ref={dialogRef}
        style={initialSize.current ?? undefined}
        role="dialog"
        aria-modal="true"
        aria-label={session.name ?? 'Session'}
      >
        <div className="fhead">
          <div className="fheadtext">
            <EditableName session={session} />
            <div className="pname">
              {session.project.name} <s>•</s> {session.project.domain}
              {session.external && <span className="badge">external</span>}
            </div>
          </div>
          <button className="closeb" type="button" onClick={onClose}>
            Esc · close
          </button>
        </div>

        {blocked && (
          <div className="alertbar alertbar--top">
            <div className="q">
              <b>{alertLabel(session.questionKind)}</b>
              {session.question}
            </div>
          </div>
        )}

        {detached ? (
          <div className="fterm fterm--note">
            {session.external ? (
              <>
                <p>
                  This session was started outside Session Deck, so there is no terminal to
                  attach to — the deck mirrors its status from hooks only.
                </p>
                <p>Switch to the terminal or editor it runs in to interact with it.</p>
              </>
            ) : (
              <>
                {detachedNote(session)
                  .split('\n')
                  .map((line) => (
                    <p key={line}>{line.charAt(0).toUpperCase() + line.slice(1)}.</p>
                  ))}
                {session.canReopen && (
                  <p>
                    <button className="newbtn" type="button" onClick={onReopen}>
                      {session.status === 'resumable' ? 'Resume session' : 'Reopen session'}
                    </button>
                  </p>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="fterm" ref={hostRef} />
        )}

        <div className="ffoot">
          <StatusPill status={session.status} />
          <SessionMeta
            session={session}
            full
            onShowPages={onShowPages}
            onShowDiff={onShowDiff}
            onReopen={onReopen}
            onShowTodos={onShowTodos}
            onShowProcesses={onShowProcesses}
          />
          <button
            className="closeb"
            type="button"
            onClick={() => {
              // A live session gets ended; one with no terminal gets removed.
              if (session.attached) window.deck.close(session.uid)
              else window.deck.remove(session.uid)
              onClose()
            }}
          >
            {session.attached ? 'End session' : 'Remove from deck'}
          </button>
        </div>
      </div>
    </div>
  )
}
