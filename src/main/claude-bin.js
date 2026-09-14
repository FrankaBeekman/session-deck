import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

let cachedClaude = null
let cachedNode = null

/**
 * A GUI Electron app does not inherit the login shell's PATH, so `which claude`
 * from process.env will usually miss. Ask a login shell instead, then fall back
 * to the usual install locations.
 */
export function resolveClaudeBin() {
  if (cachedClaude) return cachedClaude

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
