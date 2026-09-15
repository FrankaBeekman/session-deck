import { execFile } from 'child_process'
import { basename } from 'path'

/**
 * One `ps` call describes every process; everything else is lookups on it.
 * etime ([[dd-]hh:]mm:ss) becomes a start timestamp so repeated scans compare
 * equal instead of changing every tick.
 */
export function snapshot() {
  return new Promise((resolve) => {
    execFile('ps', ['-Aww', '-o', 'pid=,ppid=,etime=,command='], { maxBuffer: 16 * 1024 * 1024 }, (err, out) => {
      const table = new Map()
      if (err && !out) return resolve(table)
      const now = Date.now()
      for (const line of out.split('\n')) {
        const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/)
        if (!m) continue
        table.set(Number(m[1]), {
          pid: Number(m[1]),
          ppid: Number(m[2]),
          startedAt: now - etimeMs(m[3]),
          command: m[4]
        })
      }
      resolve(table)
    })
  })
}

function etimeMs(etime) {
  const [days, rest] = etime.includes('-') ? etime.split('-') : ['0', etime]
  const parts = rest.split(':').map(Number)
  while (parts.length < 3) parts.unshift(0)
  const [h, m, s] = parts
  return (((Number(days) * 24 + h) * 60 + m) * 60 + s) * 1000
}

function isClaude(proc) {
  const argv0 = proc.command.split(' ')[0]
  return basename(argv0) === 'claude'
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

/**
 * The macOS app a process runs inside: the first `.app` bundle on the way up
 * (Terminal, iTerm, PhpStorm, VS Code). Null for tmux or anything detached.
 */
export function appFor(pid, table) {
  let p = table.get(Number(pid))
  for (let i = 0; p && i < 24; i++) {
    const at = p.command.indexOf('.app/')
    if (at !== -1) {
      const bundle = p.command.slice(0, at + 4)
      return { bundle, name: basename(bundle, '.app') }
    }
    if (p.ppid <= 1) break
    p = table.get(p.ppid)
  }
  return null
}

export function descendants(pid, table) {
  const out = []
  const walk = (parent) => {
    for (const p of table.values()) {
      if (p.ppid === parent) {
        out.push(p)
        walk(p.pid)
      }
    }
  }
  walk(Number(pid))
  return out
}

/**
 * Claude runs each Bash call as a direct child shell:
 *   /bin/zsh -c source <shell-snapshot> … && eval '<command>' < /dev/null && pwd -P >| …
 * Returns those shells with the command they are running, unescaped.
 */
export function claudeShells(claudePid, table) {
  const shells = []
  for (const p of table.values()) {
    if (p.ppid !== Number(claudePid) || !p.command.includes('shell-snapshots')) continue
    const m = p.command.match(/eval '((?:[^']|'\\'')*)'/)
    if (!m) continue
    const kids = descendants(p.pid, table)
    shells.push({
      pid: p.pid,
      startedAt: p.startedAt,
      // ps prints newlines as \012; hooks report the real ones.
      command: m[1].replace(/'\\''/g, "'").replace(/\\012/g, '\n'),
      running: kids.map((k) =>
        k.command.replace(/\\012/g, ' ').split(' ').map((a) => basename(a)).join(' ').slice(0, 80)
      )
    })
  }
  return shells
}

/** SIGTERM a shell and everything under it, children first. Never its group:
    that could include Claude itself. */
export function killTree(pid, table) {
  for (const p of descendants(pid, table).reverse()) {
    try {
      process.kill(p.pid, 'SIGTERM')
    } catch {}
  }
  try {
    process.kill(Number(pid), 'SIGTERM')
  } catch {}
}
