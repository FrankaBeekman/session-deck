import { execFileSync } from 'child_process'
import { existsSync, accessSync, readdirSync, statSync, constants } from 'fs'
import { homedir } from 'os'
import { join, delimiter, basename } from 'path'
import { IS_WIN, tildify } from './platform.js'

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

/** The first executable called `name` on a PATH string. */
function onPath(name, pathVar) {
  for (const dir of String(pathVar ?? '').split(delimiter)) {
    if (!dir) continue
    const candidate = join(dir, name)
    try {
      accessSync(candidate, constants.X_OK)
      if (statSync(candidate).isFile()) return candidate
    } catch {}
  }
  return null
}

/**
 * Ask the user's shell. A login shell (-l) is quick but skips .zshrc, which is
 * exactly where nvm and most npm-global PATH changes live — so an interactive
 * one (-i) is tried next. Interactive startup files may print to stdout, so the
 * answer is fenced by a marker rather than taken as the whole output.
 */
function fromShell(name) {
  const shell = process.env.SHELL && existsSync(process.env.SHELL) ? process.env.SHELL : '/bin/zsh'
  for (const flags of ['-lc', '-ilc']) {
    try {
      const out = execFileSync(shell, [flags, `printf '\\n__DECK__%s\\n' "$(command -v ${name})"`], {
        encoding: 'utf8',
        timeout: 8000,
        stdio: ['ignore', 'pipe', 'ignore']
      })
      const found = out.split('\n').find((l) => l.startsWith('__DECK__'))?.slice(8).trim()
      if (found && existsSync(found)) return found
    } catch {
      // try the next way in
    }
  }
  return null
}

/** nvm installs one node per version; the newest one wins. */
function nvmBins(name) {
  const root = join(homedir(), '.nvm', 'versions', 'node')
  try {
    const newestFirst = (a, b) => b.localeCompare(a, undefined, { numeric: true })
    return readdirSync(root)
      .sort(newestFirst)
      .map((v) => join(root, v, 'bin', name))
  } catch {
    return []
  }
}

/**
 * A GUI Electron app does not inherit the login shell's PATH, and a deck started
 * from a terminal does — so check our own PATH first, then ask the shell, then
 * fall back to the usual install locations.
 */
function resolveUnix(name, candidates) {
  const found = onPath(name, process.env.PATH) ?? fromShell(name) ?? candidates.find((c) => existsSync(c))
  if (!found) {
    throw new Error(
      `Could not locate \`${name}\`. Checked PATH, your ${basename(process.env.SHELL || 'zsh')} startup files and ` +
        `${candidates.map((c) => tildify(c)).join(', ')}.`
    )
  }
  return found
}

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
  return (cachedClaude = resolveUnix('claude', [
    join(homedir(), '.claude', 'local', 'claude'),
    join(homedir(), '.local', 'bin', 'claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    join(homedir(), '.volta', 'bin', 'claude'),
    ...nvmBins('claude')
  ]))
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
  return (cachedNode = resolveUnix('node', [
    '/opt/homebrew/bin/node',
    '/usr/local/bin/node',
    '/usr/bin/node',
    join(homedir(), '.volta', 'bin', 'node'),
    ...nvmBins('node')
  ]))
}
