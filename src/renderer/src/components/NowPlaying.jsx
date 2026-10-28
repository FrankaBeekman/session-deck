import { useEffect, useState } from 'react'

const Icon = ({ d }) => (
  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
    <path fill="currentColor" d={d} />
  </svg>
)

const PREVIOUS = 'M3 3h1.6v10H3zM13 3v10L5.6 8z'
const NEXT = 'M11.4 3H13v10h-1.6zM3 3v10l7.4-5z'
const PLAY = 'M4.5 2.5v11L13 8z'
const PAUSE = 'M4 3h3v10H4zm5 0h3v10H9z'
const NOTE = 'M6 2.5v7.05A2.25 2.25 0 1 0 7.5 11.7V5.1l5-1.2v4.15A2.25 2.25 0 1 0 14 10.2V1z'

/**
 * Spotify or Apple Music in the title bar. Opt-in (Settings → Now playing);
 * main does the polling and reports one state object. Renders nothing unless
 * there is a track to show or a player the user has not allowed.
 */
export default function NowPlaying() {
  const [state, setState] = useState({ status: 'off' })

  useEffect(() => {
    window.deck.mediaState().then(setState)
    return window.deck.onMedia(setState)
  }, [])

  if (state.status === 'denied') {
    const names = state.denied.map((d) => d.label).join(' and ')
    return (
      <div className="nowplaying nowplaying--denied" role="group" aria-label="Now playing">
        <button className="closeb titlebtn" type="button" onClick={() => window.deck.openAutomationSettings()} title={`Session Deck may not control ${names}. Opens System Settings → Privacy & Security → Automation.`}>
          Allow {names}
        </button>
        <button className="closeb titlebtn nptry" type="button" onClick={() => window.deck.mediaRetry()} title="Check the permission again">
          Try again
        </button>
      </div>
    )
  }

  if (state.status !== 'ok' || !state.track) return null
  const { track, playing, artwork, source } = state
  const line = [track.name, track.artist].filter(Boolean).join(' · ')

  return (
    <div className="nowplaying" role="group" aria-label={`Now playing in ${source.label}`}>
      {/* The player's icon before the cover; without one, its name follows the track. */}
      <span className="npart" aria-hidden="true">
        {source.icon && <img className="npapp" src={source.icon} alt="" />}
        <span className="npcover">{artwork ? <img src={artwork} alt="" /> : <Icon d={NOTE} />}</span>
      </span>
      <span className="nptext" title={`${line}${track.album ? ` — ${track.album}` : ''} (${source.label})`}>
        {line}
        {!source.icon && <span className="npsource"> · {source.label}</span>}
      </span>
      <span className="npbuttons">
        <button type="button" className="npbtn" aria-label="Previous track" title="Previous track" onClick={() => window.deck.mediaCommand('previous')}>
          <Icon d={PREVIOUS} />
        </button>
        <button type="button" className="npbtn" aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'} onClick={() => window.deck.mediaCommand('playpause')}>
          <Icon d={playing ? PAUSE : PLAY} />
        </button>
        <button type="button" className="npbtn" aria-label="Next track" title="Next track" onClick={() => window.deck.mediaCommand('next')}>
          <Icon d={NEXT} />
        </button>
      </span>
    </div>
  )
}
