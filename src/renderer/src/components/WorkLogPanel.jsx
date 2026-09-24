import { useEffect, useMemo, useState } from 'react'
import { quarterHours, clockTime } from '../lib/format.js'
import SkinFrame from './SkinFrame.jsx'

function label(day) {
  const d = new Date(`${day}T12:00:00`)
  const today = new Date()
  const y = new Date()
  y.setDate(today.getDate() - 1)
  const same = (a, b) => a.toDateString() === b.toDateString()
  if (same(d, today)) return 'Today'
  if (same(d, y)) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })
}

/**
 * Set the ticket for one session, or for every session in a group, by hand.
 * It opens on the current ticket so it can be edited as well as added. Saving
 * empty, or "Use …", goes back to the detected one. Escape cancels here rather
 * than closing the whole panel.
 */
function TicketForm({ keys, current, detected, edited, label, onDone }) {
  const [draft, setDraft] = useState(current ?? '')
  const [error, setError] = useState(null)

  const save = async (value) => {
    for (const key of keys) {
      if (!(await window.deck.setTicket(key, value))) {
        setError('Use a ticket key like EXC-207.')
        return
      }
    }
    onDone(true)
  }

  return (
    <form
      className="ticketform"
      onSubmit={(e) => {
        e.preventDefault()
        save(draft)
      }}
    >
      <input
        className="filter ticketinput"
        autoFocus
        onFocus={(e) => e.target.select()}
        value={draft}
        placeholder="EXC-207"
        aria-label={label}
        aria-invalid={Boolean(error)}
        onChange={(e) => {
          setDraft(e.target.value)
          setError(null)
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          e.stopPropagation()
          onDone(false)
        }}
      />
      <button className="newbtn" type="submit">
        Save
      </button>
      {edited && (
        <button className="closeb" type="button" onClick={() => save('')} title="Forget the ticket set by hand">
          Use {detected ?? 'no ticket'}
        </button>
      )}
      <button className="closeb" type="button" onClick={() => onDone(false)}>
        Cancel
      </button>
      {error && (
        <span className="formerror ticketerror" role="alert">
          {error}
        </span>
      )}
    </form>
  )
}

/**
 * A local reference for logging hours: active time per session per day, grouped
 * by ticket. Nothing here is sent anywhere — copy it into the time tracker.
 */
export default function WorkLogPanel({ onClose }) {
  const [days, setDays] = useState([])
  const [index, setIndex] = useState(0)
  const [data, setData] = useState(null)
  const [copied, setCopied] = useState(false)
  // What is being edited: `group:<key>` for a whole group, or a session row's key.
  const [editing, setEditing] = useState(null)

  useEffect(() => {
    window.deck.worklogDays().then(setDays)
  }, [])

  const day = days[index]
  useEffect(() => {
    if (!day) return
    setData(null)
    setEditing(null)
    window.deck.worklog(day).then(setData)
  }, [day])

  const doneEditing = (changed) => {
    setEditing(null)
    if (changed) window.deck.worklog(day).then(setData)
  }

  const groups = useMemo(() => {
    if (!data) return []
    const map = new Map()
    for (const r of data.rows) {
      const key = r.ticket ?? `— ${r.project}`
      const g = map.get(key) ?? { key, ticket: r.ticket, project: r.project, minutes: 0, rows: [] }
      g.minutes += r.minutes
      g.rows.push(r)
      map.set(key, g)
    }
    return [...map.values()].sort((a, b) => b.minutes - a.minutes)
  }, [data])

  const copy = async () => {
    const lines = groups.map((g) => {
      const what = g.rows.map((r) => r.name).filter(Boolean).join('; ')
      return `${g.ticket ?? '(no ticket)'}\t${g.project}\t${quarterHours(g.minutes)}h\t${what}`
    })
    try {
      await navigator.clipboard.writeText(`${label(day)} (${day})\n${lines.join('\n')}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {}
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="picker worklog" role="dialog" aria-modal="true" aria-labelledby="worklog-title">
        <SkinFrame kind="dialog" />
        <div className="fhead">
          <div>
            <div className="sname" id="worklog-title">
              Worked on
            </div>
            <div className="pname">local reference for logging hours — not sent anywhere</div>
          </div>
          <button className="closeb" type="button" onClick={onClose}>
            Esc · close
          </button>
        </div>

        {days.length === 0 ? (
          <p className="none worklogempty">No activity recorded yet.</p>
        ) : (
          <>
            <div className="daynav">
              <button type="button" className="closeb" disabled={index >= days.length - 1} onClick={() => setIndex(index + 1)} aria-label="Previous day">
                ←
              </button>
              <span className="dayname">
                {label(day)} <span>{day}</span>
              </span>
              <button type="button" className="closeb" disabled={index === 0} onClick={() => setIndex(index - 1)} aria-label="Next day">
                →
              </button>
              <span className="spacer" />
              {data && (
                <span className="daytotal">
                  {quarterHours(data.totalMinutes)}h <span>({data.totalMinutes}m)</span>
                </span>
              )}
              <button type="button" className="newbtn" onClick={copy} disabled={!groups.length}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            <ul className="worklist">
              {groups.map((g) => (
                <li key={g.key}>
                  <div className="workhead">
                    <button
                      type="button"
                      className={`ticket ticketbtn ${g.ticket ? '' : 'ticket--none'}`}
                      aria-expanded={editing === `group:${g.key}`}
                      title={g.ticket ? 'Change the ticket for these sessions' : 'Add a ticket for these sessions'}
                      onClick={() => setEditing(editing === `group:${g.key}` ? null : `group:${g.key}`)}
                    >
                      {g.ticket ?? 'no ticket'} <span aria-hidden="true">✎</span>
                    </button>
                    <span className="workproject">{g.project}</span>
                    <span className="spacer" />
                    <span className="workhours">{quarterHours(g.minutes)}h</span>
                  </div>
                  {editing === `group:${g.key}` && (
                    <TicketForm
                      keys={g.rows.map((r) => r.key)}
                      current={g.ticket}
                      detected={g.rows[0].detected}
                      edited={g.rows.some((r) => r.edited)}
                      label={`Ticket for ${g.rows.length === 1 ? 'this session' : `these ${g.rows.length} sessions`} in ${g.project}`}
                      onDone={doneEditing}
                    />
                  )}
                  <ul className="worksessions">
                    {g.rows.map((r) => (
                      <li key={r.key}>
                        <div className="workrow">
                          <span className="worksession">{r.name ?? 'unnamed session'}</span>
                          <button
                            type="button"
                            className="ticketedit"
                            aria-expanded={editing === r.key}
                            aria-label={`${r.ticket ? 'Change' : 'Add'} the ticket for ${r.name ?? 'this session'}`}
                            onClick={() => setEditing(editing === r.key ? null : r.key)}
                          >
                            {r.edited ? '✎ set by hand' : '✎ this session'}
                          </button>
                          <span className="worktime">
                            {clockTime(r.first)}–{clockTime(r.last)} <s>•</s> {r.minutes}m
                          </span>
                        </div>
                        {editing === r.key && (
                          <TicketForm
                            keys={[r.key]}
                            current={r.ticket}
                            detected={r.detected}
                            edited={r.edited}
                            label={`Ticket for ${r.name ?? 'this session'}`}
                            onDone={doneEditing}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
              {data && groups.length === 0 && <li className="none">No activity on this day.</li>}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
