import { spawn } from 'child_process'
import { tmpdir } from 'os'
import { resolveClaudeBin } from './claude-bin.js'
import { scrubClaudeSession } from './launcher.js'

// Fast and cheap: a summary is reading, not reasoning.
export const SUMMARY_MODEL = 'haiku'
const TIMEOUT = 3 * 60 * 1000

const SYSTEM = `You summarize a Claude Code session for the developer who ran it.
You get a digest: the user's prompts (USER), Claude's replies (CLAUDE) and one
line per tool call ([Tool] target). Write in the language the user wrote in.

Use exactly these sections, as Markdown headings, and skip one only if it would
be empty:

## Goal
One or two sentences: what the user wanted, with the ticket key if there is one.

## Done
Short bullets: what was actually changed or found. Name files and commands
where it helps. No play-by-play.

## State
Where it stands now: finished, waiting on the user, blocked, or mid-way.

## Next
Short bullets: what is left to do, and anything the user has to do by hand.

At most 250 words. No preamble, no closing remarks.`

/**
 * One `claude -p` call with the digest on stdin. It runs with no tools, no
 * session file and --safe-mode — which drops the user's hooks, MCP servers and
 * CLAUDE.md. Without that the deck's own global hooks would report the summary
 * run as a new session and it would appear as a tile. Auth and model selection
 * still work as normal, so a subscription login is fine (unlike --bare).
 */
export function runSummary(digest) {
  return new Promise((resolve, reject) => {
    const env = scrubClaudeSession({ ...process.env })
    delete env.SESSION_DECK_ID
    delete env.ELECTRON_RUN_AS_NODE
    const child = spawn(
      resolveClaudeBin(),
      [
        '-p',
        '--safe-mode',
        '--no-session-persistence',
        '--tools',
        '',
        '--model',
        SUMMARY_MODEL,
        '--output-format',
        'text',
        '--system-prompt',
        SYSTEM
      ],
      // A neutral directory: nothing from a project should shape the summary.
      { cwd: tmpdir(), env, stdio: ['pipe', 'pipe', 'pipe'] }
    )
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('The summary took longer than 3 minutes and was stopped.'))
    }, TIMEOUT)
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      const text = out.trim()
      if (code === 0 && text) resolve(text)
      else reject(new Error(err.trim().split('\n').slice(-3).join(' ') || `claude exited with code ${code}`))
    })
    child.stdin.end(`Summarize this session.\n\n${digest}`)
  })
}
