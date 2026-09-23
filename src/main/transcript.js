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

/** The line of a tool call worth keeping: what it touched or ran, not its payload. */
function toolLine(block) {
  const input = block.input ?? {}
  const what = input.file_path ?? input.command ?? input.pattern ?? input.url ?? input.query ?? input.description ?? ''
  return `  [${block.name}] ${truncate(String(what).replace(/\s+/g, ' '), 160)}`
}

/**
 * A readable digest of a whole conversation, for summarizing: the user's
 * prompts, Claude's replies and one line per tool call. Tool results, thinking
 * and file snapshots are dropped — they are most of a transcript's bytes and
 * none of its story. Over `max` characters the middle goes: the start says what
 * was asked, the end says where it stands.
 *
 * Streams the file in chunks; transcripts pass 10MB.
 */
export function transcriptDigest(path, max = 120_000) {
  const parts = []
  let fd
  try {
    fd = openSync(path, 'r')
    const size = fstatSync(fd).size
    const buf = Buffer.alloc(CHUNK)
    let pos = 0
    let carry = ''
    const take = (line) => {
      // Cheap filter first: most lines are neither.
      if (!line.includes('"type":"user"') && !line.includes('"type":"assistant"')) return
      let entry
      try {
        entry = JSON.parse(line)
      } catch {
        return
      }
      if (entry.isSidechain || (entry.type !== 'user' && entry.type !== 'assistant')) return
      const content = entry.message?.content
      const blocks = typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content : []
      for (const b of blocks) {
        if (b?.type === 'text') {
          const text = String(b.text ?? '').trim()
          // Command wrappers and system reminders are not what anyone said.
          if (!text || (entry.type === 'user' && text.startsWith('<'))) continue
          parts.push(`${entry.type === 'user' ? 'USER' : 'CLAUDE'}: ${truncate(text, entry.type === 'user' ? 3000 : 1500)}`)
        } else if (b?.type === 'tool_use' && entry.type === 'assistant') {
          parts.push(toolLine(b))
        }
      }
    }
    while (pos < size) {
      const n = readSync(fd, buf, 0, Math.min(CHUNK, size - pos), pos)
      if (n <= 0) break
      pos += n
      const lines = (carry + buf.subarray(0, n).toString('utf8')).split('\n')
      carry = lines.pop()
      lines.forEach(take)
    }
    if (carry) take(carry)
  } catch {
    return null
  } finally {
    if (fd !== undefined) try { closeSync(fd) } catch {}
  }

  const text = parts.join('\n')
  if (text.length <= max) return text
  const head = text.slice(0, Math.round(max * 0.25))
  const tail = text.slice(-Math.round(max * 0.75))
  return `${head}\n\n[… the middle of the session is left out …]\n\n${tail}`
}
