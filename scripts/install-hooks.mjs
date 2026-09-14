#!/usr/bin/env node
/**
 * Merges Session Deck's hooks into ~/.claude/settings.json.
 *
 * Dry run by default — it prints what it would add and changes nothing.
 * Pass --write to actually apply it (a timestamped backup is made first).
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { randomBytes } from 'crypto'

const SETTINGS = join(homedir(), '.claude', 'settings.json')
const CONFIG_DIR = join(homedir(), '.session-deck')
const TOKEN_FILE = join(CONFIG_DIR, 'token')
const PORT = 47823
const MARKER = 'session-deck'

const EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'Notification',
  'Stop',
  'SessionEnd'
]

function ensureToken() {
  mkdirSync(CONFIG_DIR, { recursive: true })
  if (!existsSync(TOKEN_FILE)) {
    writeFileSync(TOKEN_FILE, randomBytes(24).toString('hex'), { mode: 0o600 })
  }
  return readFileSync(TOKEN_FILE, 'utf8').trim()
}

// Claude Code already puts hook_event_name and session_id in the stdin JSON,
// so the hook is a straight pass-through. `|| true` keeps a dead deck from
// ever failing a hook and blocking the session.
const command =
  `curl -sS -m 2 -X POST -H 'Content-Type: application/json' ` +
  `-H "X-Deck-Token: $(cat ~/.session-deck/token 2>/dev/null)" ` +
  `--data-binary @- http://127.0.0.1:${PORT}/hook >/dev/null 2>&1 || true`

const entry = { matcher: '*', hooks: [{ type: 'command', command, timeout: 5 }] }

function hasDeckHook(list) {
  return JSON.stringify(list ?? []).includes(MARKER)
}

function main() {
  const write = process.argv.includes('--write')
  ensureToken()

  const settings = existsSync(SETTINGS) ? JSON.parse(readFileSync(SETTINGS, 'utf8')) : {}
  settings.hooks ??= {}

  const added = []
  for (const event of EVENTS) {
    settings.hooks[event] ??= []
    if (hasDeckHook(settings.hooks[event])) continue
    settings.hooks[event].push(entry)
    added.push(event)
  }

  if (added.length === 0) {
    console.log('Session Deck hooks are already installed. Nothing to do.')
    return
  }

  console.log(`\nWould add a Session Deck hook to ${added.length} event(s):`)
  for (const e of added) console.log(`  · ${e}`)
  console.log(`\nCommand:\n  ${command}\n`)

  if (!write) {
    console.log(`Dry run — nothing written. Re-run with --write to apply:`)
    console.log(`  npm run install-hooks -- --write\n`)
    return
  }

  if (existsSync(SETTINGS)) {
    const backup = `${SETTINGS}.bak-${Date.now()}`
    copyFileSync(SETTINGS, backup)
    console.log(`Backed up existing settings to:\n  ${backup}`)
  }
  writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n')
  console.log(`Wrote ${SETTINGS}\n`)
}

main()
