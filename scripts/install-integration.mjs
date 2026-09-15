#!/usr/bin/env node
/**
 * Installs Session Deck's Claude Code integration for every session, including
 * ones started outside the deck:
 *
 *   1. hooks in ~/.claude/settings.json — status, and the ids that tie a
 *      terminal to its tile
 *   2. the MCP server at user scope — session names, test pages, pull
 *      requests and the user's checklist, plus instructions telling Claude when
 *      to use them
 *
 * Dry run by default: prints what would change and changes nothing.
 * Pass --write to apply (settings.json is backed up first).
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { randomBytes } from 'crypto'
import { execFileSync } from 'child_process'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

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
// X-Deck-Session carries the SESSION_DECK_ID the deck exported into the PTY.
// Hooks inherit Claude's environment, so this is how the deck recognises its own
// terminal after Claude switches session id (resume fallback, /clear, /resume).
// Empty for sessions started outside the deck, which is fine.
const command =
  `curl -sS -m 2 -X POST -H 'Content-Type: application/json' ` +
  `-H "X-Deck-Token: $(cat ~/.session-deck/token 2>/dev/null)" ` +
  `-H "X-Deck-Session: \${SESSION_DECK_ID:-}" ` +
  // $PPID is the process that ran the hook — claude or a shell under it. The
  // deck walks up from there to find the claude process and its app.
  `-H "X-Claude-Pid: $PPID" ` +
  `--data-binary @- http://127.0.0.1:${PORT}/hook >/dev/null 2>&1 || true`

const entry = { matcher: '*', hooks: [{ type: 'command', command, timeout: 5 }] }

function deckEntries(list) {
  return (list ?? []).filter((e) => JSON.stringify(e).includes(MARKER))
}

function main() {
  const write = process.argv.includes('--write')
  ensureToken()

  const settings = existsSync(SETTINGS) ? JSON.parse(readFileSync(SETTINGS, 'utf8')) : {}
  settings.hooks ??= {}

  const added = []
  const updated = []
  for (const event of EVENTS) {
    settings.hooks[event] ??= []
    const existing = deckEntries(settings.hooks[event])
    if (existing.length === 0) {
      settings.hooks[event].push(entry)
      added.push(event)
      continue
    }
    // Upgrade an older deck hook in place rather than adding a second one.
    for (const e of existing) {
      for (const h of e.hooks ?? []) {
        if (h.type === 'command' && h.command.includes(MARKER) && h.command !== command) {
          h.command = command
          if (!updated.includes(event)) updated.push(event)
        }
      }
    }
  }

  const mcp = planMcp()
  const hooksCurrent = added.length === 0 && updated.length === 0

  if (hooksCurrent && !mcp.change) {
    console.log('Session Deck hooks and MCP server are installed and current. Nothing to do.')
    return
  }

  if (hooksCurrent) console.log('\nHooks: installed and current.')
  if (added.length) console.log(`\nWould add a Session Deck hook to: ${added.join(', ')}`)
  if (updated.length) console.log(`\nWould update the Session Deck hook on: ${updated.join(', ')}`)
  if (!hooksCurrent) console.log(`\nHook command:\n  ${command}`)
  console.log(mcp.change ? `\nWould ${mcp.change} the MCP server (user scope):\n  ${mcp.node} ${BRIDGE_COPY}` : '\nMCP server: installed and current.')
  console.log('')

  if (!write) {
    console.log('Dry run — nothing written. Re-run with --write to apply:')
    console.log('  npm run install-integration -- --write\n')
    return
  }

  if (!hooksCurrent) {
    if (existsSync(SETTINGS)) {
      const backup = `${SETTINGS}.bak-${Date.now()}`
      copyFileSync(SETTINGS, backup)
      console.log(`Backed up existing settings to:\n  ${backup}`)
    }
    writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n')
    console.log(`Wrote ${SETTINGS}`)
  }
  if (mcp.change) applyMcp(mcp)
  console.log('\nNew Claude Code sessions pick this up; running ones keep their old setup.\n')
}

// ------------------------------------------------------------------ MCP server

const BRIDGE_COPY = join(CONFIG_DIR, 'mcp-bridge.mjs')
const BRIDGE_SOURCE = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'main', 'mcp-bridge.mjs')

function resolveNode() {
  try {
    return execFileSync(process.env.SHELL || '/bin/zsh', ['-lc', 'command -v node'], { encoding: 'utf8' }).trim()
  } catch {
    return process.execPath
  }
}

function planMcp() {
  const node = resolveNode()
  let current = null
  try {
    current = JSON.parse(readFileSync(join(homedir(), '.claude.json'), 'utf8')).mcpServers?.['session-deck'] ?? null
  } catch {}
  const wanted = { command: node, args: [BRIDGE_COPY] }
  const same = current && current.command === wanted.command && JSON.stringify(current.args) === JSON.stringify(wanted.args)
  const bridgeStale = !existsSync(BRIDGE_COPY) || readFileSync(BRIDGE_COPY, 'utf8') !== readFileSync(BRIDGE_SOURCE, 'utf8')
  return { node, change: !current ? 'add' : !same ? 'update' : bridgeStale ? 'refresh' : null, exists: Boolean(current) }
}

function applyMcp({ node, exists, change }) {
  // A stable path, refreshed by the app on start, so the registration survives
  // the app moving or updating.
  mkdirSync(CONFIG_DIR, { recursive: true })
  copyFileSync(BRIDGE_SOURCE, BRIDGE_COPY)
  if (change === 'refresh') {
    console.log(`Refreshed ${BRIDGE_COPY}`)
    return
  }
  // Registered through the Claude CLI rather than by editing ~/.claude.json.
  if (exists) execFileSync('claude', ['mcp', 'remove', '--scope', 'user', 'session-deck'], { stdio: 'inherit' })
  execFileSync('claude', ['mcp', 'add', '--scope', 'user', 'session-deck', '--', node, BRIDGE_COPY], { stdio: 'inherit' })
}

main()
