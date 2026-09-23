import { useEffect, useState } from 'react'
import { duration, ago } from '../lib/format.js'
import SkinFrame from './SkinFrame.jsx'

/**
 * Shells Claude is running for this session: everything started in the
 * background, plus foreground commands that have been going a while.
 */
export default function ProcessesPanel({ session, onClose }) {
  const [now, setNow] = useState(Date.now())
  const [stopping, setStopping] = useState(null)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const stop = async (pid) => {
    setStopping(pid)
    await window.deck.stopProcess(session.uid, pid)
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="picker processes" role="dialog" aria-modal="true" aria-labelledby="proc-title">
        <SkinFrame kind="dialog" />
        <div className="fhead">
          <div>
            <div className="sname" id="proc-title">
              Processes
            </div>
            <div className="pname">
              {session.name ?? session.project.name} <s>•</s> {session.processes.length} running
            </div>
          </div>
          <button className="closeb" type="button" onClick={onClose}>
            Esc · close
          </button>
        </div>

        <ul className="proclist">
          {session.processes.map((p) => (
            <li key={p.pid}>
              <div className="procmain">
                <span className={`prockind ${p.background ? 'is-bg' : ''}`}>{p.background ? 'background' : 'foreground'}</span>
                {p.description && <span className="procdesc">{p.description}</span>}
                <code className="proccmd" title={p.command}>
                  {p.command}
                </code>
                {p.running.length > 0 && <span className="procrunning">↳ {p.running.slice(0, 3).join(' · ')}</span>}
              </div>
              <div className="procside">
                <span className="procage">{duration(now - p.startedAt)}</span>
                <button
                  type="button"
                  className="closeb"
                  disabled={stopping === p.pid}
                  onClick={() => stop(p.pid)}
                  title="Send SIGTERM to this command and everything it started"
                >
                  {stopping === p.pid ? 'Stopping…' : 'Stop'}
                </button>
              </div>
            </li>
          ))}
          {session.processes.length === 0 && <li className="none">Nothing running right now.</li>}
        </ul>

        {session.finished.length > 0 && (
          <div className="procfinished">
            <h4 className="listlabel">Recently finished</h4>
            <ul className="proclist proclist--done">
              {session.finished.map((p) => (
                <li key={`${p.pid}-${p.endedAt}`}>
                  <div className="procmain">
                    {p.description && <span className="procdesc">{p.description}</span>}
                    <code className="proccmd" title={p.command}>
                      {p.command}
                    </code>
                  </div>
                  <div className="procside">
                    <span className="procage">
                      ran {duration(p.endedAt - p.startedAt)} <s>•</s> {ago(p.endedAt, now)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
