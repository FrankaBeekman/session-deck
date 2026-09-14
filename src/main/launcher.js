import { spawn } from 'node-pty'
import { randomUUID } from 'crypto'
import { writeFileSync, chmodSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir, homedir } from 'os'
import { app } from 'electron'
import { resolveClaudeBin, resolveNodeBin } from './claude-bin.js'
import { getToken, PORT } from './hooks.js'

// Pinned for the session's whole life. Never resized on focus change — that is
// what keeps Claude Code's TUI from re-flowing every time a tile is opened.
export const COLS = 120
export const ROWS = 32

const LAUNCHER_DIR = join(tmpdir(), 'session-deck-launchers')

/**
 * The bridge ships as an extraResource so it sits on the real filesystem (node
 * has to exec it, and it must not be inside app.asar).
 */
function bridgePath() {
  return app.isPackaged
    ? join(process.resourcesPath, 'mcp-bridge.mjs')
    : join(__dirname, '../../src/main/mcp-bridge.mjs')
}

/**
 * Local's ssh-entry script sets up PHP/MySQL/WP-CLI, cd's into the site, and
 * ends with `exec $SHELL`. Overriding SHELL makes that last line hand control
 * to Claude instead of zsh — no parsing, and it survives Local updating the
 * script. Verified against Local on 2026-09-10.
 */
export function launchSession(project, { resumeId } = {}) {
  // --resume reuses the original session id (forking is opt-in via
  // --fork-session), so a resumed session's hooks keep matching its tile.
  const sessionId = resumeId ?? randomUUID()
  mkdirSync(LAUNCHER_DIR, { recursive: true })

  const launcherPath = join(LAUNCHER_DIR, `launch-${sessionId}.sh`)
  const claudeBin = resolveClaudeBin()

  // Per-session MCP config, passed with --mcp-config. Nothing global is touched,
  // and the server only exists for sessions the deck launched.
  const mcpConfigPath = join(LAUNCHER_DIR, `mcp-${sessionId}.json`)
  writeFileSync(
    mcpConfigPath,
    JSON.stringify(
      {
        mcpServers: {
          'session-deck': {
            command: resolveNodeBin(),
            args: [bridgePath()],
            env: {
              SESSION_DECK_ID: sessionId,
              SESSION_DECK_PORT: String(PORT),
              SESSION_DECK_TOKEN: getToken()
            }
          }
        }
      },
      null,
      2
    ),
    'utf8'
  )

  const idFlag = resumeId ? `--resume ${resumeId}` : `--session-id ${sessionId}`
  writeFileSync(
    launcherPath,
    `#!/bin/bash\nexec ${JSON.stringify(claudeBin)} ${idFlag} ` +
      `--mcp-config ${JSON.stringify(mcpConfigPath)}\n`,
    'utf8'
  )
  chmodSync(launcherPath, 0o755)

  const env = {
    ...process.env,
    SHELL: launcherPath,
    TERM: 'xterm-256color',
    SESSION_DECK_ID: sessionId,
    SESSION_DECK_PORT: String(PORT),
    SESSION_DECK_TOKEN: getToken()
  }
  // Electron leaks these into children and they confuse the site shell.
  delete env.ELECTRON_RUN_AS_NODE
  delete env.NODE_ENV
  delete env.NODE_OPTIONS

  // The ssh-entry script cd's into the site itself, and its path is the
  // authoritative one -- sites.json sometimes disagrees. So cwd here only has
  // to be *valid*; a non-existent one makes posix_spawnp fail outright.
  const cwd = project.path && existsSync(project.path) ? project.path : homedir()

  const pty = spawn('/bin/bash', [project.entryScript], {
    name: 'xterm-256color',
    cols: COLS,
    rows: ROWS,
    cwd,
    env
  })

  return { sessionId, pty, launcherPath }
}
