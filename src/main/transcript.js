import { openSync, readSync, closeSync, fstatSync } from 'fs'

export function truncate(text, max) {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd() + '…'
}

/**
 * First real user message, used to name a session adopted mid-flight. Only the
 * head of the file is read: the first message is always near the top, and
 * transcripts grow to megabytes.
 */
export function firstUserMessage(path) {
  if (!path) return null
  let fd
  try {
    fd = openSync(path, 'r')
    const buf = Buffer.alloc(256 * 1024)
    const bytes = readSync(fd, buf, 0, buf.length, 0)
    for (const line of buf.subarray(0, bytes).toString('utf8').split('\n')) {
      if (!line.trim()) continue
      let entry
      try {
        entry = JSON.parse(line)
      } catch {
        continue // a truncated final line is expected when reading a prefix
      }
      if (entry.type !== 'user' || entry.isSidechain) continue
      const c = entry.message?.content
      const text = typeof c === 'string' ? c : Array.isArray(c) ? c.find((b) => b?.type === 'text')?.text : null
      const clean = String(text ?? '').trim().replace(/\s+/g, ' ')
      if (!clean || clean.startsWith('<') || clean.startsWith('/')) continue // command wrappers
      return truncate(clean, 60)
    }
  } catch {
    return null
  } finally {
    if (fd !== undefined) try { closeSync(fd) } catch {}
  }
  return null
}

const CHUNK = 1024 * 1024

/**
 * Scan a transcript from `offset` for `/rename` entries, which Claude Code
 * writes as `{"type":"custom-title","customTitle":"…"}`. A rename can land
 * anywhere in a long file and can happen again at any time, so this reads
 * incrementally: the whole file once, then only bytes appended since.
 *
 * Returns the latest title found (or null) and the offset to resume from,
 * which always sits on a line boundary.
 */
export function scanTitles(path, offset = 0) {
  let fd
  try {
    fd = openSync(path, 'r')
    const size = fstatSync(fd).size
    if (size < offset) offset = 0 // file was replaced; start over
    let title = null
    let pos = offset
    let carry = ''
    const buf = Buffer.alloc(CHUNK)
    while (pos < size) {
      const n = readSync(fd, buf, 0, Math.min(CHUNK, size - pos), pos)
      if (n <= 0) break
      pos += n
      const text = carry + buf.subarray(0, n).toString('utf8')
      const lines = text.split('\n')
      carry = lines.pop() // possibly incomplete
      for (const line of lines) {
        if (!line.includes('"custom-title"')) continue
        try {
          const entry = JSON.parse(line)
          if (entry.type === 'custom-title' && entry.customTitle) title = String(entry.customTitle)
        } catch {}
      }
    }
    return { title, offset: pos - Buffer.byteLength(carry) }
  } catch {
    return { title: null, offset }
  } finally {
    if (fd !== undefined) try { closeSync(fd) } catch {}
  }
}
