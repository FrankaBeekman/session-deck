#!/usr/bin/env node
/**
 * Session Deck's hook, as a Node script: the same request as the macOS curl
 * command, without shell syntax. Used on Windows, where hooks may run under
 * cmd.exe or Git Bash and `$(cat …)`, `${VAR:-}` and `$PPID` cannot be relied
 * on. (On macOS curl stays: node costs ~150ms per hook, curl ~10ms.)
 *
 * Never fails the hook: every error path exits 0, so a stopped deck can never
 * block or break a Claude session.
 */
import { request } from 'http'
import { readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const PORT = Number(process.env.SESSION_DECK_PORT || 47823)
const done = () => process.exit(0)
setTimeout(done, 4000).unref?.() // hard cap, whatever happens

let token = ''
try {
  token = readFileSync(join(homedir(), '.session-deck', 'token'), 'utf8').trim()
} catch {
  done()
}

const chunks = []
process.stdin.on('data', (c) => chunks.push(c))
process.stdin.on('error', done)
process.stdin.on('end', () => {
  const body = Buffer.concat(chunks)
  const req = request(
    {
      host: '127.0.0.1',
      port: PORT,
      path: '/hook',
      method: 'POST',
      timeout: 3000,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': body.length,
        'X-Deck-Token': token,
        'X-Deck-Session': process.env.SESSION_DECK_ID || '',
        // Our parent ran this hook: claude, or a shell under it.
        'X-Claude-Pid': String(process.ppid)
      }
    },
    (res) => {
      res.resume()
      res.on('end', done)
    }
  )
  req.on('error', done)
  req.on('timeout', () => {
    req.destroy()
    done()
  })
  req.end(body)
})
