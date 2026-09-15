import { useState } from 'react'
import { ago } from '../lib/format.js'

/**
 * What the *user* has to do once Claude is done: added by Claude through
 * add_user_todo, or typed in here. Kept per project, so it outlives sessions.
 */
export default function ChecklistPanel({ session, onClose }) {
  const [text, setText] = useState('')
  const todos = [...session.todos].sort((a, b) => a.at - b.at)
  const open = todos.filter((t) => !t.done)
  const done = todos.filter((t) => t.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))

  const add = (e) => {
    e.preventDefault()
    const clean = text.trim()
    if (!clean) return
    window.deck.addTodo(session.uid, clean)
    setText('')
  }

  const Row = ({ t }) => (
    <li className={t.done ? 'isdone' : ''}>
      <label className="todocheck">
        <input
          type="checkbox"
          id={`todo-${t.id}`}
          checked={t.done}
          onChange={() => window.deck.toggleTodo(session.projectKey, t.id)}
        />
        <span className="todotext">{t.text}</span>
      </label>
      <span className="todometa">
        {t.source === 'claude' ? 'from Claude' : 'added by you'} <s>•</s> {ago(t.at)}
        {t.sessionName && (
          <>
            {' '}
            <s>•</s> {t.sessionName}
          </>
        )}
      </span>
      <button
        type="button"
        className="dismiss dismiss--inline"
        aria-label={`Remove “${t.text}”`}
        title="Remove"
        onClick={() => window.deck.removeTodo(session.projectKey, t.id)}
      >
        ×
      </button>
    </li>
  )

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="picker checklist" role="dialog" aria-modal="true" aria-labelledby="checklist-title">
        <div className="fhead">
          <div>
            <div className="sname" id="checklist-title">
              Your to-dos
            </div>
            <div className="pname">
              {session.project.name} <s>•</s> {open.length} open
            </div>
          </div>
          <button className="closeb" type="button" onClick={onClose}>
            Esc · close
          </button>
        </div>

        <form className="todoadd" onSubmit={add}>
          <input
            id="todo-new"
            className="filter"
            placeholder="Add something to do after Claude is done…"
            aria-label="New to-do"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
          <button className="newbtn" type="submit" disabled={!text.trim()}>
            Add
          </button>
        </form>

        <ul className="todolist">
          {open.map((t) => (
            <Row key={t.id} t={t} />
          ))}
          {open.length === 0 && <li className="none">Nothing left to do for this project.</li>}
        </ul>
        {done.length > 0 && (
          <details className="tododone">
            <summary>Done ({done.length})</summary>
            <ul className="todolist">
              {done.map((t) => (
                <Row key={t.id} t={t} />
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  )
}
