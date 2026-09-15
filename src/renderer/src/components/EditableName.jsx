import { useState } from 'react'

/**
 * A session name that renames in place with a single click. The pencil cursor
 * marks it as an edit target, distinct from the rest of the tile, which opens
 * the session. As a real button it is also reachable from the keyboard.
 */
export default function EditableName({ session, className = 'sname' }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const label = session.name ?? 'Untitled session'

  const start = (e) => {
    e.stopPropagation()
    setValue(session.name ?? '')
    setEditing(true)
  }
  const commit = () => {
    const next = value.trim()
    if (next && next !== session.name) window.deck.rename(session.uid, next)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        id={`rename-${session.uid}`}
        className="renameinput"
        aria-label="Session name"
        autoFocus
        value={value}
        maxLength={80}
        onChange={(e) => setValue(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation() // keep Esc/Enter/Space away from the tile and the app
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
        }}
        onBlur={commit}
      />
    )
  }

  return (
    <button
      type="button"
      className={`${className} namebtn`}
      onClick={start}
      onKeyDown={(e) => e.stopPropagation()}
      title="Rename session"
      aria-label={`Rename session: ${label}`}
    >
      {label}
    </button>
  )
}
