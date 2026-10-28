/**
 * The now playing widget's pure half: the AppleScript it runs and how it reads
 * the answers. No Electron imports, so it can be checked directly with node.
 */

// ASCII unit separator: a tab or a newline can turn up in a track name.
export const SEP = '\x1f'

// `try` is a statement in AppleScript, not an expression, so each field gets one.
const field = (name, expr) => `set ${name} to ""\ntry\nset ${name} to (${expr}) as string\nend try`

/**
 * One line per poll: state, name, artist, album, track id, artwork url.
 * Everything sits inside `is running`, which does not start the app — a bare
 * `tell` would launch it, so the poll must never reach one with the app closed.
 */
function stateScript(app, idExpr, artworkExpr) {
  return `if application "${app}" is running then
tell application "${app}"
set s to player state as string
if s is "stopped" then return s
set t to current track
${field('n', 'name of t')}
${field('a', 'artist of t')}
${field('b', 'album of t')}
${field('i', idExpr)}
${field('w', artworkExpr)}
set d to character id 31
return s & d & n & d & a & d & b & d & i & d & w
end tell
else
return "not-running"
end if`
}

/**
 * Music has no artwork URL: its cover is bytes on the track. The script writes
 * them to the path it is given (as an argument, never spliced into the source)
 * and returns "none" when the track has no artwork, which streams often lack.
 */
const MUSIC_ARTWORK = `on run argv
if application "Music" is not running then return "none"
tell application "Music"
try
set a to raw data of artwork 1 of current track
on error
return "none"
end try
end tell
set f to open for access (POSIX file (item 1 of argv)) with write permission
try
set eof f to 0
write a to f
close access f
on error
close access f
return "none"
end try
return "ok"
end run`

/** The players the widget knows, by `pgrep -x` process name. */
export const SOURCES_MAC = [
  {
    id: 'spotify',
    label: 'Spotify',
    process: 'Spotify',
    app: 'Spotify',
    state: stateScript('Spotify', 'id of t', 'artwork url of t')
  },
  {
    id: 'music',
    label: 'Apple Music',
    process: 'Music',
    app: 'Music',
    state: stateScript('Music', 'persistent ID of t', '""'),
    artwork: MUSIC_ARTWORK
  }
]

/** The only verbs the renderer can ask for. Both apps know all three. */
export const COMMANDS = { playpause: 'playpause', next: 'next track', previous: 'previous track' }

export function commandScript(source, verb) {
  const command = COMMANDS[verb]
  if (!command) return null
  return `if application "${source.app}" is running then tell application "${source.app}" to ${command}`
}

/** `pgrep -x -l` output → running process name → its pid. */
export function parsePgrep(out) {
  const pids = new Map()
  for (const line of String(out ?? '').split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(.+?)\s*$/)
    if (m && !pids.has(m[2])) pids.set(m[2], Number(m[1]))
  }
  return pids
}

/** The .app bundle an executable lives in: `/Applications/Spotify.app/Contents/MacOS/Spotify` → `/Applications/Spotify.app`. */
export function bundleOf(executable) {
  const m = String(executable ?? '').trim().match(/^(\/.*?\.app)\/Contents\//)
  return m ? m[1] : null
}

/**
 * A poll's output. Ads, podcasts and radio leave fields empty; a track with no
 * name at all is treated as nothing playing rather than shown blank.
 */
export function parseState(out) {
  const text = String(out ?? '').replace(/\r?\n$/, '')
  if (text === 'not-running') return { running: false, playing: false, track: null }
  const [state, name = '', artist = '', album = '', id = '', artworkUrl = ''] = text.split(SEP)
  const playing = state === 'playing'
  if (state === 'stopped' || !name.trim()) return { running: true, playing: false, track: null }
  return {
    running: true,
    playing,
    track: { id: id || `${name}${SEP}${artist}`, name, artist, album, artworkUrl: artworkUrl || null }
  }
}

/**
 * Which player the widget shows. Playing beats paused; between equals, the one
 * whose track or play state changed last; a stopped player is never shown.
 * Each state: { id, track, playing, changedAt }.
 */
export function pickActive(states) {
  const candidates = states.filter((s) => s.track)
  if (candidates.length === 0) return null
  return candidates.reduce((best, s) => {
    if (s.playing !== best.playing) return s.playing ? s : best
    return (s.changedAt ?? 0) > (best.changedAt ?? 0) ? s : best
  })
}

/** Spotify's CDN only: the cover is fetched by main, so the URL is checked here. */
export function isArtworkUrl(url) {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname === 'i.scdn.co' && !u.username && !u.password && !u.port
  } catch {
    return false
  }
}

/** The image type from its first bytes, so a cover is never labelled by guess. */
export function imageType(bytes) {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  return null
}

/** True when osascript failed because the user (or nobody yet) allowed Automation. */
export const isDenied = (stderr) => /-1743\b/.test(String(stderr ?? ''))
