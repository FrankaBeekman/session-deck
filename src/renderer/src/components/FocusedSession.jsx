import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import StatusPill from './StatusPill.jsx'

/**
 * The only real terminal emulator in the app, mounted on focus and disposed on
 * close. Its size matches the PTY exactly and is never changed — resizing would
 * re-flow Claude Code's TUI on every open.
 */
export default function FocusedSession({ session, onClose }) {
  const hostRef = useRef(null)

  const detached = !session.attached

  useEffect(() => {
    if (detached) return
    let term
    let offData
    let disposed = false

    ;(async () => {
      const { cols, rows } = await window.deck.ptySize()
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
      term.open(hostRef.current)

      term.write(await window.deck.buffer(session.id))
      term.focus()

      term.onData((data) => window.deck.write(session.id, data))
      offData = window.deck.onData(({ sessionId, chunk }) => {
        if (sessionId === session.id) term.write(chunk)
      })
    })()

    return () => {
      disposed = true
      offData?.()
      term?.dispose()
    }
  }, [session.id, detached])

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="focused" role="dialog" aria-modal="true" aria-label={session.name ?? 'Session'}>
        <div className="fhead">
          <div>
            <div className="sname">{session.name ?? 'Untitled session'}</div>
            <div className="pname">
              {session.project.name} <s>•</s> {session.project.domain}
            </div>
          </div>
          <button className="closeb" type="button" onClick={onClose}>
            Esc · close
          </button>
        </div>
        {detached ? (
          <div className="fterm fterm--note">
            <p>
              {session.external
                ? 'This session was started outside Session Deck, so there is no terminal to attach to — the deck is mirroring its status from hooks only.'
                : 'This session is not attached to a terminal right now.'}
            </p>
            <p>
              {session.external
                ? 'Switch to the terminal or editor it is running in to interact with it.'
                : 'Resume it from its tile to reopen the conversation.'}
            </p>
          </div>
        ) : (
          <div className="fterm" ref={hostRef} />
        )}
        <div className="ffoot">
          <StatusPill status={session.status} />
          <span className="links">
            <button
              className="closeb"
              type="button"
              onClick={() => {
                // A live session gets ended; one with no terminal gets removed.
                if (session.attached) window.deck.close(session.id)
                else window.deck.remove(session.id)
                onClose()
              }}
            >
              {session.attached ? 'End session' : 'Remove from deck'}
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
