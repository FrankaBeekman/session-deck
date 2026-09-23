import { useEffect, useState } from 'react'
import LightMarkdown from './LightMarkdown.jsx'
import { ago, ipcError } from '../lib/format.js'

/**
 * A summary of one session: goal, what was done, where it stands, what is left.
 * Made on request by `claude -p` and kept, so reopening is instant; when the
 * conversation has moved on since, it offers to make a fresh one.
 */
export default function SummaryPanel({ session, onClose }) {
  const [info, setInfo] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  const generate = async () => {
    setBusy(true)
    setError(null)
    try {
      setInfo(await window.deck.summarize(session.uid))
    } catch (err) {
      setError(ipcError(err))
    } finally {
      setBusy(false)
    }
  }

  // Opening the panel is the request: with nothing saved yet, start right away.
  useEffect(() => {
    window.deck.summary(session.uid).then((found) => {
      setInfo(found)
      if (found?.pending || (found?.available && !found.summary)) generate()
    })
  }, [session.uid])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(info.summary.text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {}
  }

  const summary = info?.summary

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="picker summarypanel" role="dialog" aria-modal="true" aria-labelledby="summary-title">
        <div className="fhead">
          <div className="fheadtext">
            <div className="sname" id="summary-title">
              Summary
            </div>
            <div className="pname">
              {session.name ?? session.project.name}
              {summary && !busy && (
                <>
                  {' '}
                  <s>•</s> made {ago(summary.at)}
                </>
              )}
            </div>
          </div>
          <button className="closeb" type="button" onClick={onClose}>
            Esc · close
          </button>
        </div>

        <div className="summarybody" aria-live="polite" aria-busy={busy}>
          {info && !info.available && <p className="none">There is no conversation to summarize yet.</p>}
          {busy && <p className="summarywait">Reading the conversation and writing a summary… this takes a few seconds.</p>}
          {error && <p className="formerror">Could not make a summary: {error}</p>}
          {summary && !busy && (
            <>
              {info.outdated && (
                <p className="summarystale">The session has continued since this summary was made.</p>
              )}
              <LightMarkdown text={summary.text} />
            </>
          )}
        </div>

        {info?.available && (
          <div className="summaryfoot">
            <button className="newbtn" type="button" onClick={generate} disabled={busy}>
              {summary || error ? 'Make a new summary' : 'Summarize'}
            </button>
            {summary && (
              <button className="closeb" type="button" onClick={copy} disabled={busy}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
            <span className="panelhint">Made by Claude (Haiku) from this session’s transcript.</span>
          </div>
        )}
      </div>
    </div>
  )
}
