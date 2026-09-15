import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { IS_WIN } from './platform.js'

/**
 * Windows: a GUI app does get the user's PATH, so `where` is reliable. Prefer a
 * real .exe over an npm .cmd shim — both run, but the .exe is what the native
 * installer puts there.
 */
function whereWindows(name) {
  try {
    const lines = execFileSync('where', [name], { encoding: 'utf8', timeout: 5000 })
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    return lines.find((l) => /\.exe$/i.test(l)) ?? lines.find((l) => /\.(cmd|bat)$/i.test(l)) ?? lines[0] ?? null
  } catch {
    return null
  }
}

let cachedClaude = null
let cachedNode = null

/**
 * A GUI Electron app does not inherit the login shell's PATH, so `which claude`
 * from process.env will usually miss. Ask a login shell instead, then fall back
 * to the usual install locations.
 */
export function resolveClaudeBin() {
  if (cachedClaude) return cachedClaude
  if (IS_WIN) {
    const found =
      whereWindows('claude') ??
      [
        join(homedir(), '.local', 'bin', 'claude.exe'),
        join(process.env.APPDATA ?? '', 'npm', 'claude.cmd')
      ].find((c) => existsSync(c))
    if (!found) throw new Error('Could not locate the `claude` binary.')
    return (cachedClaude = found)
  }

  try {
    const out = execFileSync(process.env.SHELL || '/bin/zsh', ['-lc', 'command -v claude'], {
      encoding: 'utf8',
      timeout: 5000
    }).trim()
    if (out && existsSync(out)) return (cachedClaude = out)
  } catch {
    // fall through to the fixed candidates below
  }

  const candidates = [
    join(homedir(), '.claude', 'local', 'claude'),
    join(homedir(), '.local', 'bin', 'claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude'
  ]
  const found = candidates.find((c) => existsSync(c))
  if (!found) throw new Error('Could not locate the `claude` binary.')
  return (cachedClaude = found)
}

/** The MCP bridge runs under node, which a GUI process also cannot assume on PATH. */
export function resolveNodeBin() {
  if (cachedNode) return cachedNode
  if (IS_WIN) {
    const found =
      whereWindows('node') ??
      [join(process.env.ProgramFiles ?? 'C:\\Program Files', 'nodejs', 'node.exe')].find((c) => existsSync(c))
    if (!found) throw new Error('Could not locate the `node` binary for the MCP bridge.')
    return (cachedNode = found)
  }
  try {
    const out = execFileSync(process.env.SHELL || '/bin/zsh', ['-lc', 'command -v node'], {
      encoding: 'utf8',
      timeout: 5000
    }).trim()
    if (out && existsSync(out)) return (cachedNode = out)
  } catch {
    // fall through
  }
  const candidates = ['/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node']
  const found = candidates.find((c) => existsSync(c))
  if (!found) throw new Error('Could not locate the `node` binary for the MCP bridge.')
  return (cachedNode = found)
}
