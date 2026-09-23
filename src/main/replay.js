/**
 * The raw PTY output kept per session, replayed into xterm.js when the session
 * is focused. Kept free of Electron and node-pty imports so it can be exercised
 * directly.
 *
 * Claude Code redraws in full with clear-screen + clear-scrollback and then
 * reprints the whole conversation, so everything before the last such clear is
 * dead — the terminal erased it too. Dropping it keeps the buffer to the current
 * conversation, which is what lets the cap be generous enough to scroll back to
 * the start.
 *
 * Private modes (bracketed paste, cursor visibility, focus events) are set once
 * at startup and would be lost with the trimmed text, so they are tracked apart
 * and replayed first.
 */
const CLEAR = '\x1b[2J\x1b[3J'
const MODE = /\x1b\[\?([\d;]+)([hl])/g
// Switching screens up front would send the replayed text to the wrong one.
const SCREEN_MODES = new Set(['47', '1047', '1049'])
export const MAX_REPLAY = 4_000_000 // chars

export function createReplay() {
  // `tail` mirrors the end of `text`: reading that off a long concatenated
  // string would flatten it, megabytes per chunk.
  return { text: '', tail: '', modes: {} }
}

export function append(replay, chunk, max = MAX_REPLAY) {
  for (const m of chunk.matchAll(MODE)) {
    for (const mode of m[1].split(';')) if (!SCREEN_MODES.has(mode)) replay.modes[mode] = m[2]
  }

  // Only the new chunk (plus enough of the old text to catch a clear split
  // across chunks) can hold a new clear, so only that is searched.
  const seam = replay.tail + chunk
  let last = -1
  for (let i = seam.indexOf(CLEAR); i !== -1; i = seam.indexOf(CLEAR, i + 1)) last = i
  let text = last === -1 ? replay.text + chunk : seam.slice(last)

  // Over the cap, cut at a line start so no escape sequence is split in half.
  // The slack means a long session trims now and then, not on every chunk.
  if (text.length > max * 1.25) {
    const cut = text.length - max
    const nl = text.indexOf('\n', cut)
    text = text.slice(nl === -1 ? cut : nl + 1)
  }
  replay.text = text
  replay.tail = seam.slice(-(CLEAR.length - 1))
}

export function replayText(replay) {
  const modes = Object.entries(replay.modes)
    .map(([mode, state]) => `\x1b[?${mode}${state}`)
    .join('')
  return modes + replay.text
}
