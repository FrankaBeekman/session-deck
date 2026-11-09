import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import SkinFrame from './SkinFrame.jsx'
import { ago, ipcError } from '../lib/format.js'
import { RATES, speechBlocks } from '../lib/speech.js'

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null

export const findVoice = (uri) => (uri && synth?.getVoices().find((v) => v.voiceURI === uri)) || null

/** The word at `start`, when the engine reports no length. */
const wordLength = (text, start) => text.slice(start).match(/^\S+/)?.[0].length ?? 0

/**
 * Claude's latest reply in a session, read aloud with the text on screen: the
 * sentence being spoken is highlighted, and the word within it, so it can be
 * followed along. Opening it is the play button; nothing is ever read unasked.
 *
 * Spoken a sentence at a time: pausing, skipping and a new speed all start
 * cleanly from a known place, which pausing the engine mid-utterance does not.
 */
export default function ReadAloud({ session, rate, voice, pauseMusic, onRate, onClose }) {
  const [reply, setReply] = useState(undefined) // undefined: loading, null: none
  const [error, setError] = useState(null)
  const [current, setCurrent] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [word, setWord] = useState(null) // { start, length } within the current sentence
  const token = useRef(0)
  const utterance = useRef(null) // held, or Chromium may drop its events
  const position = useRef({ index: 0, from: 0 })
  const musicPaused = useRef(false)
  const body = useRef(null)

  const blocks = useMemo(() => (reply ? speechBlocks(reply.text) : []), [reply])
  const all = useMemo(() => blocks.flatMap((b) => b.sentences), [blocks])

  const load = useCallback(() => {
    setError(null)
    window.deck
      .reply(session.uid)
      .then(setReply)
      .catch((err) => {
        setReply(null)
        setError(ipcError(err))
      })
  }, [session.uid])
  useEffect(load, [load])

  // Music off while it reads, back on when done — only if it was ours to stop.
  const stopMusic = async () => {
    if (!pauseMusic || musicPaused.current) return
    const media = await window.deck.mediaState()
    if (media.status === 'ok' && media.playing) {
      window.deck.mediaCommand('playpause')
      musicPaused.current = true
    }
  }
  const restoreMusic = useCallback(async () => {
    if (!musicPaused.current) return
    musicPaused.current = false
    const media = await window.deck.mediaState()
    if (media.status === 'ok' && !media.playing) window.deck.mediaCommand('playpause')
  }, [])

  const halt = () => {
    token.current++
    synth?.cancel()
  }

  const speak = (index, from = 0) => {
    halt()
    const sentence = all[index]
    if (!synth || !sentence) return
    const mine = token.current
    const u = new SpeechSynthesisUtterance(sentence.text.slice(from))
    const v = findVoice(voice)
    if (v) {
      u.voice = v
      u.lang = v.lang
    }
    u.rate = rate
    u.onboundary = (e) => {
      if (mine !== token.current || e.name === 'sentence') return
      const start = from + e.charIndex
      setWord({ start, length: e.charLength || wordLength(sentence.text, start) })
      position.current = { index, from: start }
    }
    u.onend = () => {
      if (mine !== token.current) return
      setWord(null)
      if (index + 1 < all.length) speak(index + 1)
      else {
        setPlaying(false)
        setCurrent(0)
        position.current = { index: 0, from: 0 }
        restoreMusic()
      }
    }
    u.onerror = (e) => {
      if (mine !== token.current || e.error === 'interrupted' || e.error === 'canceled') return
      setPlaying(false)
      setError(`The voice stopped: ${e.error}`)
    }
    utterance.current = u
    position.current = { index, from }
    setCurrent(index)
    setWord(null)
    setPlaying(true)
    synth.speak(u)
  }

  const play = (index = position.current.index, from = position.current.from) => {
    setError(null)
    stopMusic()
    speak(index, from)
  }
  const pause = () => {
    halt()
    setPlaying(false)
  }
  const jump = (index) => {
    const i = Math.max(0, Math.min(all.length - 1, index))
    if (playing) play(i, 0)
    else {
      position.current = { index: i, from: 0 }
      setCurrent(i)
      setWord(null)
    }
  }

  // The button that opened this was the play button.
  useEffect(() => {
    if (all.length) play(0, 0)
  }, [all])

  // A new speed or voice takes effect from the word being read.
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    if (playing) play()
  }, [rate, voice])

  // Closing stops it, and hands the music back.
  useEffect(
    () => () => {
      token.current++
      synth?.cancel()
      restoreMusic()
    },
    [restoreMusic]
  )

  useEffect(() => {
    body.current?.querySelector('.rasentence--current')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [current])

  useEffect(() => {
    const onKey = (e) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, select, textarea')) return
      if (e.key === ' ') {
        e.preventDefault()
        playing ? pause() : play()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        jump(position.current.index - 1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        jump(position.current.index + 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const renderSentence = (s) => {
    const isCurrent = s.id === current
    const w = isCurrent && word && word.length ? word : null
    return (
      <span key={s.id}>
        <span
          className={`rasentence${isCurrent ? ' rasentence--current' : ''}${s.id < current ? ' rasentence--read' : ''}`}
          onClick={() => (playing ? play(s.id, 0) : jump(s.id))}
        >
          {w ? (
            <>
              {s.text.slice(0, w.start)}
              <mark className="raword">{s.text.slice(w.start, w.start + w.length)}</mark>
              {s.text.slice(w.start + w.length)}
            </>
          ) : (
            s.text
          )}
        </span>{' '}
      </span>
    )
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="picker readaloud" role="dialog" aria-modal="true" aria-labelledby="ra-title">
        <SkinFrame kind="dialog" />
        <div className="fhead">
          <div className="fheadtext">
            <div className="sname" id="ra-title">
              Read aloud
            </div>
            <div className="pname">
              {session.name ?? session.project.name}
              {reply?.at && (
                <>
                  {' '}
                  <s>•</s> Claude’s reply from {ago(reply.at)}
                </>
              )}
            </div>
          </div>
          <button className="closeb" type="button" onClick={onClose}>
            Esc · close
          </button>
        </div>

        <div className="rabody" ref={body}>
          {!synth && <p className="formerror">This system has no speech voices.</p>}
          {error && <p className="formerror">{error}</p>}
          {reply === undefined && <p className="none">Reading the conversation…</p>}
          {reply === null && !error && <p className="none">Claude hasn’t replied in this session yet.</p>}
          {blocks.map((b, i) =>
            b.kind === 'code' ? (
              <pre key={i} className="racode" title="Code is shown, not read">
                {b.code}
              </pre>
            ) : b.kind === 'head' ? (
              <h4 key={i}>{b.sentences.map(renderSentence)}</h4>
            ) : b.kind === 'item' ? (
              <p key={i} className="raitem">
                {b.sentences.map(renderSentence)}
              </p>
            ) : (
              <p key={i}>{b.sentences.map(renderSentence)}</p>
            )
          )}
        </div>

        {all.length > 0 && (
          <div className="ffoot rafoot">
            <div className="racontrols" role="group" aria-label="Playback">
              <button className="closeb" type="button" onClick={() => jump(current - 1)} disabled={current === 0} title="Previous sentence (←)">
                ‹ Back
              </button>
              <button className="newbtn raplay" type="button" onClick={() => (playing ? pause() : play())} title="Space">
                {playing ? 'Pause' : current > 0 || position.current.from > 0 ? 'Resume' : 'Play'}
              </button>
              <button
                className="closeb"
                type="button"
                onClick={() => jump(current + 1)}
                disabled={current >= all.length - 1}
                title="Next sentence (→)"
              >
                Next ›
              </button>
              <span className="muted raprogress">
                {current + 1} / {all.length}
              </span>
            </div>
            <div className="density" role="group" aria-label="Speed">
              {RATES.map((r) => (
                <button key={r} type="button" aria-pressed={rate === r} onClick={() => onRate(r)}>
                  {r}×
                </button>
              ))}
            </div>
            <button className="closeb" type="button" onClick={load} title="Load Claude’s latest reply again">
              Latest
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
