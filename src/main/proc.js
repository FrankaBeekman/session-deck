import { execFile } from 'child_process'
import { IS_WIN, baseName } from './platform.js'

/**
 * One process listing describes every process; everything else is a lookup on
 * it. Each entry: { pid, ppid, startedAt, command }. A start timestamp rather
 * than an age, so repeated scans compare equal instead of changing every tick.
 */
export function snapshot() {
  return IS_WIN ? snapshotWindows() : snapshotPosix()
}

function snapshotPosix() {
  return new Promise((resolve) => {
    execFile('ps', ['-Aww', '-o', 'pid=,ppid=,etime=,command='], { maxBuffer: 16 * 1024 * 1024 }, (err, out) => {
      if (err && !out) return resolve(new Map())
      resolve(parsePs(out))
    })
  })
}

export function parsePs(out, now = Date.now()) {
  const table = new Map()
  for (const line of out.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/)
    if (!m) continue
    table.set(Number(m[1]), { pid: Number(m[1]), ppid: Number(m[2]), startedAt: now - etimeMs(m[3]), command: m[4] })
  }
  return table
}

function etimeMs(etime) {
  const [days, rest] = etime.includes('-') ? etime.split('-') : ['0', etime]
  const parts = rest.split(':').map(Number)
  while (parts.length < 3) parts.unshift(0)
  const [h, m, s] = parts
  return (((Number(days) * 24 + h) * 60 + m) * 60 + s) * 1000
}

/**
 * Windows has no ps. Win32_Process via PowerShell gives the same four facts; wmic
 * would be faster but is removed from current Windows 11. Tab-separated, with
 * the command line last because it is the only field that can contain spaces.
 */
const WIN_QUERY =
  '[Console]::OutputEncoding=[Text.Encoding]::UTF8;' +
  'Get-CimInstance Win32_Process | ForEach-Object {' +
  ' $c = if ($_.CommandLine) { $_.CommandLine } else { $_.ExecutablePath };' +
  ' "{0}`t{1}`t{2}`t{3}" -f $_.ProcessId, $_.ParentProcessId,' +
  ' ([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds(), ($c -replace "`r?`n", " ") }'

function snapshotWindows() {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', WIN_QUERY],
      { maxBuffer: 32 * 1024 * 1024, windowsHide: true, timeout: 15000 },
      (err, out) => {
        if (err && !out) return resolve(new Map())
        resolve(parseWindowsProcesses(out))
      }
    )
  })
}

export function parseWindowsProcesses(out) {
  const table = new Map()
  for (const line of out.split(/\r?\n/)) {
    const parts = line.split('\t')
    if (parts.length < 4) continue
    const pid = Number(parts[0])
    if (!Number.isFinite(pid) || pid <= 0) continue
    table.set(pid, {
      pid,
      ppid: Number(parts[1]) || 0,
      startedAt: Number(parts[2]) || Date.now(),
      command: parts.slice(3).join('\t')
    })
  }
  return table
}

/**
 * The executable of a command line. Windows often records unquoted paths with
 * spaces ("C:\Program Files\nodejs\node.exe cli.js"), so an unquoted line is cut
 * at its first executable extension rather than its first space.
 */
export function argv0(command) {
  const c = String(command ?? '').trim()
  if (c.startsWith('"')) return c.slice(1, c.indexOf('"', 1) === -1 ? undefined : c.indexOf('"', 1))
  const exe = c.match(/^(.+?\.(?:exe|com|bat|cmd))(?=\s|$)/i)
  return exe ? exe[1] : c.split(/\s+/)[0]
}

function isClaude(proc) {
  const exe = baseName(argv0(proc.command)).toLowerCase()
  return exe === 'claude' || exe === 'claude.exe' || /@anthropic-ai[\\/]claude-code/.test(proc.command)
}

/** The `claude` process at or above `pid` — hooks report a shell below it. */
export function claudeAncestor(pid, table) {
  let p = table.get(Number(pid))
  for (let i = 0; p && i < 8; i++) {
    if (isClaude(p)) return p.pid
    p = table.get(p.ppid)
  }
  return null
}

/** Console hosts and shells between a terminal app and claude — never "the app". */
const WIN_PASSTHROUGH = new Set([
  'cmd.exe', 'powershell.exe', 'pwsh.exe', 'bash.exe', 'sh.exe', 'wsl.exe', 'conhost.exe',
  'openconsole.exe', 'node.exe', 'claude.exe', 'git-bash.exe', 'mintty.exe', 'winpty-agent.exe'
])
const WIN_NAMES = {
  'windowsterminal.exe': 'Windows Terminal',
  'phpstorm64.exe': 'PhpStorm',
  'phpstorm.exe': 'PhpStorm',
  'code.exe': 'VS Code',
  'cursor.exe': 'Cursor',
  'warp.exe': 'Warp',
  'wezterm-gui.exe': 'WezTerm',
  'alacritty.exe': 'Alacritty'
}

/**
 * The app a process runs inside.
 * macOS: the first `.app` bundle on the way up (Terminal, iTerm, PhpStorm).
 * Windows: the first ancestor that is not a shell or console host (Windows
 * Terminal, PhpStorm, VS Code). A console window started from Explorer has no
 * such ancestor — then the top-most shell is what to focus.
 * Returns { name, bundle?, pid } or null.
 */
export function appFor(pid, table, platform = process.platform) {
  let p = table.get(Number(pid))
  let topShell = null
  for (let i = 0; p && i < 24; i++) {
    if (platform === 'win32') {
      const exe = baseName(argv0(p.command)).toLowerCase()
      if (exe === 'explorer.exe' || p.ppid <= 4) break
      if (!WIN_PASSTHROUGH.has(exe)) {
        return { pid: p.pid, name: WIN_NAMES[exe] ?? exe.replace(/\.exe$/, '') }
      }
      if (['cmd.exe', 'powershell.exe', 'pwsh.exe'].includes(exe)) topShell = p
    } else {
      const at = p.command.indexOf('.app/')
      if (at !== -1) {
        const bundle = p.command.slice(0, at + 4)
        return { pid: p.pid, bundle, name: baseName(bundle).replace(/\.app$/, '') }
      }
      if (p.ppid <= 1) break
    }
    p = table.get(p.ppid)
  }
  if (platform === 'win32' && topShell) {
    const exe = baseName(argv0(topShell.command)).toLowerCase()
    return { pid: topShell.pid, name: exe === 'cmd.exe' ? 'Command Prompt' : 'PowerShell' }
  }
  return null
}

/** Bring an app found by appFor to the front. */
export function focusApp(app) {
  if (!app) return
  if (IS_WIN) {
    // AppActivate by process id raises that process's top-level window.
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', `(New-Object -ComObject WScript.Shell).AppActivate(${Number(app.pid)}) | Out-Null`],
      { windowsHide: true }
    )
  } else {
    execFile('open', ['-a', app.bundle])
  }
}

export function descendants(pid, table) {
  const out = []
  const walk = (parent) => {
    for (const p of table.values()) {
      if (p.ppid === parent && p.pid !== parent) {
        out.push(p)
        walk(p.pid)
      }
    }
  }
  walk(Number(pid))
  return out
}

/**
 * Claude runs each Bash call as a direct child shell with a snapshot of the
 * user's shell config — zsh or bash on macOS, Git Bash on Windows:
 *   … -c source <shell-snapshots/…> … && eval '<command>' < /dev/null && pwd -P >| …
 * Returns those shells with the command they are running, unescaped.
 */
export function claudeShells(claudePid, table) {
  const shells = []
  for (const p of table.values()) {
    if (p.ppid !== Number(claudePid) || !p.command.includes('shell-snapshots')) continue
    const m = p.command.match(/eval '((?:[^']|'\\'')*)'/)
    if (!m) continue
    shells.push({
      pid: p.pid,
      startedAt: p.startedAt,
      // ps prints newlines as \012; hooks report the real ones.
      command: m[1].replace(/'\\''/g, "'").replace(/\\012/g, '\n'),
      running: descendants(p.pid, table).map((k) =>
        k.command.replace(/\\012/g, ' ').split(' ').map((a) => baseName(a) || a).join(' ').slice(0, 80)
      )
    })
  }
  return shells
}

/**
 * Stop a shell and everything under it — never its process group, which could
 * include Claude itself. Windows: taskkill /T walks the tree the same way.
 */
export function killTree(pid, table) {
  if (IS_WIN) {
    execFile('taskkill', ['/PID', String(Number(pid)), '/T', '/F'], { windowsHide: true })
    return
  }
  for (const p of descendants(pid, table).reverse()) {
    try {
      process.kill(p.pid, 'SIGTERM')
    } catch {}
  }
  try {
    process.kill(Number(pid), 'SIGTERM')
  } catch {}
}
