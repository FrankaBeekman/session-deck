#!/usr/bin/env node
/**
 * Session Deck's MCP server: a stdio JSON-RPC bridge that forwards tool calls to
 * the running deck over localhost.
 *
 * Deliberately dependency-free (node builtins only) -- it is written to a temp
 * directory per session and executed by Claude Code, so it cannot rely on the
 * app's node_modules being reachable from wherever it lands.
 *
 * Identity comes from the environment: the deck exports SESSION_DECK_ID into the
 * session it spawned, and Claude Code passes its env down to MCP subprocesses.
 */
import { createInterface } from 'readline'
import { request } from 'http'

const SESSION_ID = process.env.SESSION_DECK_ID
const PORT = Number(process.env.SESSION_DECK_PORT || 47823)
const TOKEN = process.env.SESSION_DECK_TOKEN || ''
const FALLBACK_PROTOCOL = '2025-06-18'

const TOOLS = [
  {
    name: 'set_session_name',
    description:
      'Name this Claude Code session so it is identifiable on the Session Deck ' +
      'dashboard. Call this once, early, with a short human-readable summary of ' +
      'the task you are working on (e.g. "Quotation template redesign"). ' +
      'Max ~60 characters.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Short task summary, ~60 chars max.' }
      },
      required: ['name']
    }
  },
  {
    name: 'report_test_page',
    description:
      'Register a preview/test page you created (usually via WP-CLI) so it appears ' +
      'as a clickable link on this session\'s dashboard tile. Call this immediately ' +
      'after creating the page, with its full URL.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full URL, e.g. http://site.local/?p=4182' },
        title: { type: 'string', description: 'Optional label for the link.' }
      },
      required: ['url']
    }
  }
]

function post(path, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ sessionId: SESSION_ID, ...body })
    const req = request(
      {
        host: '127.0.0.1',
        port: PORT,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'X-Deck-Token': TOKEN
        },
        timeout: 2000
      },
      (res) => {
        res.resume()
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode })
      }
    )
    req.on('error', () => resolve({ ok: false, status: 0 }))
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0 }) })
    req.end(data)
  })
}

function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n')
}
function fail(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n')
}
const text = (t, isError = false) => ({ content: [{ type: 'text', text: t }], isError })

/** Distinguish "app is not running" from "app is running but does not know me". */
function explain({ status }) {
  if (status === 0) return 'Session Deck is not running, so nothing was recorded.'
  if (status === 404) return 'Session Deck is running but is not tracking this session.'
  if (status === 403) return 'Session Deck rejected the token for this session.'
  return `Session Deck returned HTTP ${status}.`
}

async function callTool(name, args) {
  if (!SESSION_ID) {
    return text('Session Deck is not tracking this session (SESSION_DECK_ID unset).', true)
  }

  if (name === 'set_session_name') {
    const value = String(args?.name ?? '').trim().slice(0, 80)
    if (!value) return text('A non-empty name is required.', true)
    const r = await post('/mcp/name', { name: value })
    return r.ok ? text(`Session named "${value}" on the deck.`) : text(explain(r), true)
  }

  if (name === 'report_test_page') {
    const url = String(args?.url ?? '').trim()
    if (!/^https?:\/\//i.test(url)) return text('A full http(s) URL is required.', true)
    const r = await post('/mcp/test-page', {
      url,
      title: String(args?.title ?? '').trim().slice(0, 120)
    })
    return r.ok ? text(`Test page registered on the deck: ${url}`) : text(explain(r), true)
  }

  return text(`Unknown tool: ${name}`, true)
}

createInterface({ input: process.stdin }).on('line', async (line) => {
  if (!line.trim()) return
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  const { id, method, params } = msg
  // Notifications carry no id and must never be answered.
  if (id === undefined || id === null) return

  try {
    if (method === 'initialize') {
      reply(id, {
        protocolVersion: params?.protocolVersion ?? FALLBACK_PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: 'session-deck', version: '0.1.0' }
      })
    } else if (method === 'tools/list') {
      reply(id, { tools: TOOLS })
    } else if (method === 'tools/call') {
      reply(id, await callTool(params?.name, params?.arguments))
    } else if (method === 'ping') {
      reply(id, {})
    } else {
      fail(id, -32601, `Method not found: ${method}`)
    }
  } catch (err) {
    fail(id, -32603, err?.message ?? 'Internal error')
  }
})
