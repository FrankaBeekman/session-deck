import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

/**
 * Durable state for the deck. Deliberately a JSON file, not SQLite: the payload
 * is a few hundred links, and a native module would buy nothing while adding the
 * rebuild/arch failure modes that already cost us a day on node-pty.
 *
 * Writes go through a temp file + rename so a crash mid-write cannot leave a
 * truncated store behind.
 */
const DIR = join(homedir(), '.session-deck')
const FILE = join(DIR, 'store.json')
const TMP = join(DIR, 'store.json.tmp')

const EMPTY = { version: 1, testPages: {}, sessions: {} }

export function load() {
  try {
    if (!existsSync(FILE)) return structuredClone(EMPTY)
    const parsed = JSON.parse(readFileSync(FILE, 'utf8'))
    return {
      ...structuredClone(EMPTY),
      ...parsed,
      testPages: parsed.testPages ?? {},
      sessions: parsed.sessions ?? {}
    }
  } catch (err) {
    console.error('[store] unreadable, starting empty:', err.message)
    return structuredClone(EMPTY)
  }
}

let pending = null

export function save(state) {
  // Coalesce bursts -- a single tool call can touch the store several times.
  if (pending) clearTimeout(pending)
  pending = setTimeout(() => {
    pending = null
    try {
      mkdirSync(DIR, { recursive: true })
      writeFileSync(TMP, JSON.stringify(state, null, 2), 'utf8')
      renameSync(TMP, FILE)
    } catch (err) {
      console.error('[store] write failed:', err.message)
    }
  }, 200)
}

/** Flush synchronously — used on quit, where a timer would never fire. */
export function flush(state) {
  if (pending) {
    clearTimeout(pending)
    pending = null
  }
  try {
    mkdirSync(DIR, { recursive: true })
    writeFileSync(TMP, JSON.stringify(state, null, 2), 'utf8')
    renameSync(TMP, FILE)
  } catch (err) {
    console.error('[store] flush failed:', err.message)
  }
}

export const STORE_PATH = FILE
