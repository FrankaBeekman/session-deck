import { createServer } from 'http'
import { appendFileSync } from 'fs'
import { randomBytes } from 'crypto'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join, basename } from 'path'
import { registry } from './registry.js'

export const PORT = 47823
const CONFIG_DIR = join(homedir(), '.session-deck')
const TOKEN_FILE = join(CONFIG_DIR, 'token')
const LOG_FILE = join(CONFIG_DIR, 'hooks.jsonl')

export function getToken() {
  mkdirSync(CONFIG_DIR, { recursive: true })
  if (!existsSync(TOKEN_FILE)) {
    writeFileSync(TOKEN_FILE, randomBytes(24).toString('hex'), { mode: 0o600 })
  }
  return readFileSync(TOKEN_FILE, 'utf8').trim()
}

/** Turn a raw hook payload into the one line a tile should show. */
function describe(payload) {
  const tool = payload.tool_name
  const input = payload.tool_input ?? {}

  if (!tool) return null
  if (tool === 'Bash') return `Bash  ${(input.command ?? '').slice(0, 60)}`

  const target = input.file_path ?? input.path ?? input.pattern ?? input.url ?? ''
  return target ? `${tool}  ${basename(String(target))}` : tool
}

function apply(payload) {
  if (!payload.session_id) return

  let session = registry.get(payload.session_id)
  if (!session) {
    // Don't adopt a session we're only hearing about as it ends.
    if (payload.hook_event_name === 'SessionEnd') return
    session = registry.adopt(payload.session_id, payload.cwd, payload.transcript_path)
  }

  switch (payload.hook_event_name) {
    case 'SessionStart':
      session.status = 'ready'
      break
    case 'UserPromptSubmit': {
      session.status = 'working'
      session.question = null
      const prompt = String(payload.prompt ?? '')
      // A tile should never read "Untitled session". The first prompt is a decent
      // name immediately; MCP's set_session_name replaces it with a better one.
      if (!session.namedByMcp && !session.name && prompt.trim()) {
        const clean = prompt.trim().replace(/\s+/g, ' ')
        session.name =
          clean.length <= 60
            ? clean
            : clean.slice(0, clean.slice(0, 60).lastIndexOf(' ') > 36
                ? clean.slice(0, 60).lastIndexOf(' ')
                : 60).trimEnd() + '…'
      }
      registry.pushActivity(session, `> ${prompt.slice(0, 70)}`)
      break
    }
    case 'PreToolUse': {
      session.status = 'working'
      if (payload.cwd) session.cwd = payload.cwd
      const target = payload.tool_input?.file_path ?? payload.tool_input?.path
      if (target) registry.pushTouched(session, String(target))
      const line = describe(payload)
      if (line) registry.pushActivity(session, line)
      break
    }
    case 'Notification': {
      const kind = payload.notification_type ?? ''
      // `idle_prompt` just means Claude finished and awaits the next instruction.
      // Treating it as blocked made the deck raise its one urgent signal for a
      // session that wanted nothing -- the fastest way to make the alert useless.
      if (kind === 'idle_prompt') {
        session.status = 'done'
        session.question = null
        session.questionKind = null
        break
      }
      session.status = 'needs-you'
      session.question = payload.message ?? 'Waiting for your input'
      session.questionKind = kind || 'unknown'
      break
    }
    case 'Stop':
      session.status = 'done'
      session.question = null
      session.questionKind = null
      break
    case 'SessionEnd':
      session.status = 'closed'
      registry.markEnded(session.id)
      break
    default:
      return
  }
  registry.touch(session)
}

export function startHookServer(onPortBusy) {
  const token = getToken()

  const ROUTES = new Set(['/hook', '/mcp/name', '/mcp/test-page'])

  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/sessions') {
      if (req.headers['x-deck-token'] !== token) {
        res.writeHead(403).end()
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(registry.serialize(), null, 2))
      return
    }

    if (req.method !== 'POST' || !ROUTES.has(req.url)) {
      res.writeHead(404).end()
      return
    }
    if (req.headers['x-deck-token'] !== token) {
      res.writeHead(403).end()
      return
    }

    let body = ''
    req.on('data', (c) => {
      body += c
      if (body.length > 1_000_000) req.destroy()
    })
    req.on('end', () => {
      if (req.url !== '/hook') {
        try {
          const { sessionId, name, url, title } = JSON.parse(body)
          const ok =
            req.url === '/mcp/name'
              ? registry.setName(sessionId, name)
              : registry.addTestPage(sessionId, { url, title })
          res.writeHead(ok ? 204 : 404).end()
        } catch {
          res.writeHead(400).end()
        }
        return
      }
      try {
        const payload = JSON.parse(body)
        // Raw payloads, so status bugs are diagnosed from evidence rather than
        // through the UI. Especially: what Notification actually carries.
        try {
          appendFileSync(LOG_FILE, JSON.stringify({ at: Date.now(), ...payload }) + '\n')
        } catch {}
        apply(payload)
      } catch (err) {
        console.error('[hooks] bad payload', err.message)
      }
      res.writeHead(204).end()
    })
  })

  // Dev and the packaged app share this port. Without this, launching one while
  // the other runs throws an unhandled EADDRINUSE and the app dies at startup.
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `[hooks] port ${PORT} is already in use — another Session Deck ` +
          `(or \`npm run dev\`) is running. Status updates will not arrive in this window.`
      )
      onPortBusy?.()
      return
    }
    console.error('[hooks]', err)
  })

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[hooks] listening on 127.0.0.1:${PORT}`)
  })
  return server
}
