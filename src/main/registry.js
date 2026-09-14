import { EventEmitter } from 'events'
import { launchSession, COLS, ROWS } from './launcher.js'
import { listProjects, getProject } from './local.js'
import { basename } from 'path'
import { openSync, readSync, closeSync } from 'fs'
import { randomUUID } from 'crypto'
import { load, save, flush } from './store.js'

/**
 * Name an adopted session from the first real user message in its transcript.
 * Without this an adopted session reads "Untitled session" until its next
 * prompt, which for a long-running session could be a very long time.
 *
 * Only the head of the file is read -- the first user message is always near the
 * top, and transcripts grow to megabytes.
 */
function truncate(text, max) {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd() + '…'
}

function nameFromTranscript(path) {
  if (!path) return null
  let fd
  try {
    fd = openSync(path, 'r')
    const buf = Buffer.alloc(256 * 1024)
    const bytes = readSync(fd, buf, 0, buf.length, 0)
    const head = buf.subarray(0, bytes).toString('utf8')

    for (const line of head.split('\n')) {
      if (!line.trim()) continue
      let entry
      try {
        entry = JSON.parse(line)
      } catch {
        continue // a truncated final line is expected when reading a prefix
      }
      if (entry.type !== 'user' || entry.isSidechain) continue

      const content = entry.message?.content
      const text =
        typeof content === 'string'
          ? content
          : Array.isArray(content)
            ? content.find((b) => b?.type === 'text')?.text
            : null

      const clean = String(text ?? '').trim().replace(/\s+/g, ' ')
      // Skip slash-command and system-injected wrappers.
      if (!clean || clean.startsWith('<') || clean.startsWith('/')) continue
      return truncate(clean, 60)
    }
  } catch {
    return null
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd)
      } catch {}
    }
  }
  return null
}

const MAX_BUFFER = 200_000 // chars of raw PTY output kept for the focused view

/**
 * Tile state is derived from hook events, never from scraping the terminal.
 * Claude Code redraws its TUI with cursor movement, so the raw PTY stream has
 * no stable notion of "the last four lines" — but hooks hand us exactly the
 * structured facts the tile needs to show.
 */
class Registry extends EventEmitter {
  constructor() {
    super()
    this.sessions = new Map()
    // Test pages accumulate per project and outlive both the session that made
    // them and the app itself.
    this.store = load()
    this.restoreResumable()
  }

  /** MCP: set_session_name. Always wins over the prompt-derived fallback. */
  setName(id, name) {
    const s = this.sessions.get(id)
    if (!s) return false
    s.name = name
    s.namedByMcp = true
    this.touch(s)
    return true
  }

  /**
   * A session the deck launched is a child of this process, so quitting kills it.
   * The conversation survives on disk though, and `--resume <uuid>` reopens it
   * under the same id -- so the tile keeps its identity across a restart.
   */
  restoreResumable() {
    const WEEK = 7 * 24 * 60 * 60 * 1000
    const records = Object.values(this.store.sessions ?? {})
    let pruned = false

    for (const rec of records) {
      // Sessions the user ended deliberately are finished, not interrupted.
      const stale = Date.now() - (rec.lastSeen ?? 0) > WEEK
      if (rec.endedCleanly || stale) {
        delete this.store.sessions[rec.id]
        pruned = true
        continue
      }
      const project = rec.projectId ? getProject(rec.projectId) : null
      if (!project) {
        // Its Local site is gone; nothing to resume into.
        delete this.store.sessions[rec.id]
        pruned = true
        continue
      }

      this.sessions.set(rec.id, {
        id: rec.id,
        name: rec.name ?? null,
        external: false,
        resumable: true,
        project: {
          id: project.id,
          name: project.name,
          domain: project.domain,
          path: project.path
        },
        status: 'resumable',
        activity: [],
        question: null,
        questionKind: null,
        cwd: project.path,
        touched: [],
        startedAt: rec.startedAt ?? rec.lastSeen ?? Date.now(),
        updatedAt: rec.lastSeen ?? Date.now(),
        buffer: '',
        pty: null
      })
    }
    if (pruned) save(this.store)
  }

  rememberSession(session) {
    if (session.external) return
    this.store.sessions[session.id] = {
      id: session.id,
      projectId: session.project.id,
      projectName: session.project.name,
      name: session.name ?? null,
      startedAt: session.startedAt,
      lastSeen: Date.now(),
      endedCleanly: false
    }
    save(this.store)
  }

  markEnded(id) {
    const rec = this.store.sessions?.[id]
    if (!rec) return
    rec.endedCleanly = true
    save(this.store)
  }

  /** Reopen a conversation the deck lost when it quit. */
  resume(id) {
    const placeholder = this.sessions.get(id)
    if (!placeholder?.resumable) return null
    const project = getProject(placeholder.project.id)
    if (!project) return null

    this.sessions.delete(id)
    return this.launch(project, { resumeId: id, name: placeholder.name })
  }

  /** Stable key for a project — Local's site id, else the path. */
  projectKey(project) {
    return project?.id || project?.path || 'unknown'
  }

  pagesFor(project) {
    return this.store.testPages[this.projectKey(project)] ?? []
  }

  /** MCP: report_test_page */
  addTestPage(id, page) {
    const s = this.sessions.get(id)
    if (!s) return false

    const key = this.projectKey(s.project)
    const entry = {
      id: randomUUID(),
      url: page.url,
      title: page.title || page.url,
      at: Date.now(),
      sessionId: id,
      sessionName: s.name ?? null,
      projectName: s.project.name
    }

    const existing = this.store.testPages[key] ?? []
    // Re-reporting the same URL updates it rather than duplicating the row.
    const deduped = existing.filter((e) => e.url !== entry.url)
    this.store.testPages[key] = [...deduped, entry]
    save(this.store)

    this.touch(s)
    return true
  }

  /** Removes the deck's record only. The WordPress page itself is untouched. */
  forgetTestPage(projectKey, pageId) {
    const list = this.store.testPages[projectKey]
    if (!list) return false
    const next = list.filter((e) => e.id !== pageId)
    if (next.length === list.length) return false
    this.store.testPages[projectKey] = next
    save(this.store)
    this.emit('change', this.serialize())
    return true
  }

  flushStore() {
    flush(this.store)
  }

  launch(project, { resumeId, name } = {}) {
    const { sessionId, pty } = launchSession(project, { resumeId })

    const session = {
      id: sessionId,
      name: name ?? null, // replaced by MCP set_session_name, or the first prompt
      project: { id: project.id, name: project.name, domain: project.domain, path: project.path },
      status: 'starting',
      activity: [], // last few hook-derived lines — this is the tile preview
      question: null, // populated while status === 'needs-you'
      startedAt: Date.now(),
      updatedAt: Date.now(),
      buffer: '',
      pty
    }

    pty.onData((chunk) => {
      session.buffer = (session.buffer + chunk).slice(-MAX_BUFFER)
      this.emit('data', sessionId, chunk)
    })

    pty.onExit(() => {
      session.status = 'closed'
      session.pty = null
      this.touch(session)
    })

    this.sessions.set(sessionId, session)
    this.rememberSession(session)
    this.touch(session)
    return session
  }

  get(id) {
    return this.sessions.get(id) ?? null
  }

  /**
   * Adopt a session started outside the deck (a terminal, an IDE). Hooks are
   * installed globally, so these events arrive anyway -- dropping them made the
   * deck quietly under-report what was running. Adopted sessions are read-only:
   * no PTY, so no terminal and no launch, but full status.
   */
  adopt(id, cwd, transcriptPath) {
    const dir = cwd || ''
    const match = listProjects().find((p) => p.path && dir.startsWith(p.path))

    const session = {
      id,
      name: nameFromTranscript(transcriptPath),
      external: true,
      project: match
        ? { id: match.id, name: match.name, domain: match.domain, path: match.path }
        : { id: null, name: basename(dir) || 'unknown', domain: 'not a Local site', path: dir },
      status: 'working',
      activity: [],
      question: null,
      questionKind: null,
      cwd: dir,
      touched: [],
      startedAt: Date.now(),
      updatedAt: Date.now(),
      buffer: '',
      pty: null
    }
    this.sessions.set(id, session)
    this.touch(session)
    return session
  }

  write(id, data) {
    this.sessions.get(id)?.pty?.write(data)
  }

  /** End a running session. The tile stays, showing Closed. */
  close(id) {
    const s = this.sessions.get(id)
    if (!s) return
    if (!s.pty) return this.remove(id) // nothing to kill; the ask is to remove it
    s.pty.kill()
    s.status = 'closed'
    s.pty = null
    this.touch(s)
  }

  /**
   * Drop a tile from the deck. Kills the PTY first if one is still running, and
   * marks the durable record ended so it does not reappear as resumable after a
   * restart -- removing it is an explicit "I am done with this".
   */
  remove(id) {
    const s = this.sessions.get(id)
    if (!s) return
    s.pty?.kill()
    this.sessions.delete(id)
    if (!s.external) this.markEnded(id)
    this.emit('change', this.serialize())
  }

  /** Paths a session edited — how the diff view finds the repos that matter. */
  pushTouched(session, path) {
    if (!path) return
    if (session.touched.includes(path)) return
    session.touched = [...session.touched, path].slice(-300)
  }

  pushActivity(session, line) {
    session.activity = [...session.activity, line].slice(-4)
  }

  touch(session) {
    session.updatedAt = Date.now()
    const rec = this.store.sessions?.[session.id]
    if (rec && !session.external) {
      rec.name = session.name ?? rec.name
      rec.lastSeen = session.updatedAt
      save(this.store)
    }
    this.emit('change', this.serialize())
  }

  /** PTY handles and the raw buffer never cross the IPC boundary. */
  serialize() {
    return [...this.sessions.values()].map((s) => ({
      id: s.id,
      name: s.name,
      project: s.project,
      status: s.status,
      activity: s.activity,
      question: s.question,
      projectKey: this.projectKey(s.project),
      questionKind: s.questionKind ?? null,
      external: Boolean(s.external),
      resumable: Boolean(s.resumable),
      attached: Boolean(s.pty),
      testPages: this.pagesFor(s.project),
      startedAt: s.startedAt,
      updatedAt: s.updatedAt
    }))
  }
}

export const registry = new Registry()
export { COLS, ROWS }
