import { useEffect, useMemo, useState } from 'react'
import { quarterHours, clockTime } from '../lib/format.js'

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
 * A local reference for logging hours: active time per session per day, grouped
 * by ticket. Nothing here is sent anywhere — copy it into the time tracker.
 */
export default function WorkLogPanel({ onClose }) {
  const [days, setDays] = useState([])
  const [index, setIndex] = useState(0)
  const [data, setData] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    window.deck.worklogDays().then(setDays)
  }, [])

  const day = days[index]
  useEffect(() => {
    if (!day) return
    setData(null)
    window.deck.worklog(day).then(setData)
  }, [day])

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
                    <span className={`ticket ${g.ticket ? '' : 'ticket--none'}`}>{g.ticket ?? 'no ticket'}</span>
                    <span className="workproject">{g.project}</span>
                    <span className="spacer" />
                    <span className="workhours">{quarterHours(g.minutes)}h</span>
                  </div>
                  <ul className="worksessions">
                    {g.rows.map((r) => (
                      <li key={r.key}>
                        <span className="worksession">{r.name ?? 'unnamed session'}</span>
                        <span className="worktime">
                          {clockTime(r.first)}–{clockTime(r.last)} <s>•</s> {r.minutes}m
                        </span>
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
