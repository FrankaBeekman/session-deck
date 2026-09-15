import { readFileSync, existsSync } from 'fs'

/**
 * A local reference for logging hours — never written anywhere else.
 *
 * Kept as compact per-day blocks of activity rather than re-derived from the
 * hook log: that log stores whole tool payloads and passed 11MB within a week.
 * Activity within IDLE_GAP of the previous event extends the current block;
 * a longer silence starts a new one, so a lunch break is not billed.
 */
const IDLE_GAP = 10 * 60 * 1000
const MIN_BLOCK = 60 * 1000
const TICKET = /\b([A-Z][A-Z0-9]{1,9}-\d{1,6})\b/g
const NOT_TICKETS = new Set(['UTF', 'ISO', 'SHA', 'PHP', 'WCAG', 'TLS', 'HTTP', 'AES', 'RSA', 'CVE', 'ES', 'MD', 'X', 'GPT', 'RFC'])

export function dayKey(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function ticketsIn(text) {
  const found = []
  for (const m of String(text ?? '').matchAll(TICKET)) {
    if (!NOT_TICKETS.has(m[1].split('-')[0])) found.push(m[1])
  }
  return found
}

/**
 * Record one moment of activity.
 * entry: { key, at, project, projectKey, name, cwd, text }
 */
export function record(log, entry) {
  const day = (log[dayKey(entry.at)] ??= {})
  const row = (day[entry.key] ??= { key: entry.key, blocks: [], tickets: {} })
  row.project = entry.project ?? row.project
  row.projectKey = entry.projectKey ?? row.projectKey
  row.name = entry.name ?? row.name
  row.cwd = entry.cwd ?? row.cwd
  for (const t of ticketsIn(`${entry.text ?? ''} ${entry.name ?? ''} ${entry.branch ?? ''}`)) {
    row.tickets[t] = (row.tickets[t] ?? 0) + 1
  }
  const last = row.blocks.at(-1)
  if (last && entry.at >= last[0] && entry.at - last[1] <= IDLE_GAP) {
    last[1] = Math.max(last[1], entry.at)
  } else {
    row.blocks.push([entry.at, entry.at])
  }
}

export function summarize(log, day) {
  const rows = Object.values(log[day] ?? {}).map((row) => {
    const ms = row.blocks.reduce((sum, [a, b]) => sum + Math.max(b - a, MIN_BLOCK), 0)
    const ticket = Object.entries(row.tickets).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    return {
      key: row.key,
      project: row.project ?? 'unknown',
      name: row.name ?? null,
      ticket,
      minutes: Math.round(ms / 60000),
      first: row.blocks[0]?.[0] ?? null,
      last: row.blocks.at(-1)?.[1] ?? null,
      blocks: row.blocks.length
    }
  })
  rows.sort((a, b) => (a.first ?? 0) - (b.first ?? 0))
  return { day, rows, totalMinutes: rows.reduce((n, r) => n + r.minutes, 0) }
}

export function days(log) {
  return Object.keys(log).sort().reverse()
}

/** One-off import of history that predates the work log. */
export function backfill(log, hookLogPath, describe) {
  if (!existsSync(hookLogPath)) return 0
  let n = 0
  for (const line of readFileSync(hookLogPath, 'utf8').split('\n')) {
    if (!line) continue
    let e
    try {
      e = JSON.parse(line)
    } catch {
      continue
    }
    if (!e.at || !e.session_id) continue
    const meta = describe(e)
    if (meta?.skip) continue
    record(log, { key: e.session_id, at: e.at, cwd: e.cwd, text: e.prompt, ...meta })
    n++
  }
  return n
}
