import { spawn } from 'child_process'
import { createHash } from 'crypto'
import { copyFileSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { CONFIG_DIR } from './config-dir.js'
import { isInside } from './platform.js'
import { redact } from './redact.js'
import { composerCommand, composerEnv, forgetFetch, git, GIT_ENV, remotesOf } from './composer.js'
import { defaultCommitMessage, isBranchName, isPackageName, lockChanges, updateCommand } from './composer-core.js'

/**
 * Composer updates per environment — doing. Every change happens in a git
 * worktree the deck owns, checked out *detached* at `<remote>/<branch>`:
 *
 *   - your checkout, its vendor/ and your local branches are never touched,
 *     so a local `develop` with unpushed commits of its own is left alone;
 *   - the push is `HEAD:refs/heads/<branch>`, never forced, so a remote that
 *     moved meanwhile makes it fail instead of losing anyone's work.
 *
 * Nothing is committed or pushed without its own call from the dialog. Each
 * step is logged with its command and output, and streamed to the dialog.
 */

const WORKTREES = join(CONFIG_DIR, 'worktrees')
const MAX_OUTPUT = 200_000 // per step, kept for the prompt; the tail is what matters
const SENT_OUTPUT = 20_000 // per step, sent to the dialog on every update
const TAIL_FOR_PROMPT = 12_000

const ops = new Map() // `${root}\0${branch}` -> op
let listener = () => {}

/** One listener: index.js forwards every change to the window. */
export function onOpChange(fn) {
  listener = fn
}

const keyOf = (root, branch) => `${root}\0${branch}`

const sha = (text) => createHash('sha1').update(text).digest('hex')

/**
 * One folder per project and branch. The readable part alone could collide
 * (`release/1` and `release_1`), so a hash of the real name makes it unique.
 */
export function worktreePath(root, branch) {
  return join(WORKTREES, sha(root).slice(0, 10), `${branch.replace(/[^A-Za-z0-9._-]/g, '_')}-${sha(branch).slice(0, 6)}`)
}

/**
 * What a worktree is for, beside it: its branch (the folder name is only a
 * readable stand-in), the ticket and the packages picked. So after a restart a
 * pending commit keeps its ticket in the message, and can still be found.
 */
const metaPath = (worktree) => `${worktree}.json`

function writeMeta(op) {
  try {
    writeFileSync(metaPath(op.worktree), JSON.stringify({ branch: op.branch, ticket: op.ticket, packages: op.packages }), { mode: 0o600 })
  } catch {}
}

function readMeta(worktree) {
  try {
    const m = JSON.parse(readFileSync(metaPath(worktree), 'utf8'))
    return {
      branch: isBranchName(m.branch) ? m.branch : null,
      ticket: typeof m.ticket === 'string' && /^[A-Z][A-Z0-9]{1,9}-\d{1,6}$/.test(m.ticket) ? m.ticket : null,
      packages: Array.isArray(m.packages) ? m.packages.filter(isPackageName) : []
    }
  } catch {
    return null
  }
}

/**
 * Branches of this project with deck work that isn't pushed yet — also when
 * they aren't an environment any more ("Current branch only", after switching).
 */
export async function pendingBranches({ root, remote }) {
  const dir = join(WORKTREES, sha(root).slice(0, 10))
  const branches = new Set()
  for (const op of ops.values()) {
    if (op.root === root && ['review', 'committed', 'failed'].includes(op.stage)) branches.add(op.branch)
  }
  let files = []
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json'))
  } catch {}
  for (const f of files) {
    const meta = readMeta(join(dir, f.slice(0, -5)))
    if (!meta?.branch || branches.has(meta.branch)) continue
    const state = await opState({ root, branch: meta.branch, remote })
    if (state.stage === 'review' || state.stage === 'committed') branches.add(meta.branch)
  }
  return [...branches]
}

/** What the dialog sees: no functions, no child processes. */
function publicState(op) {
  return {
    root: op.root,
    branch: op.branch,
    stage: op.stage, // idle | running | review | committed | pushed | failed
    busy: op.busy,
    worktree: op.worktree,
    remote: op.remote,
    packages: op.packages,
    // Only the tail goes over IPC, ~10 times a second while output streams;
    // the whole of it stays here, for the prompt.
    steps: op.steps.map(({ id, kind, title, cmd, startedAt, endedAt, code, output, truncated }) => ({
      id, kind, title, cmd, startedAt, endedAt, code,
      output: output.length > SENT_OUTPUT ? output.slice(-SENT_OUTPUT) : output,
      truncated: truncated || output.length > SENT_OUTPUT
    })),
    failed: op.failed,
    review: op.review,
    commit: op.commit,
    note: op.note
  }
}

let emitTimer = null
const dirty = new Set()
/** Output arrives in many small chunks; send at most ~10 updates a second. */
function emit(op, now = false) {
  dirty.add(op)
  if (now) return flush()
  emitTimer ??= setTimeout(flush, 100)
}
function flush() {
  clearTimeout(emitTimer)
  emitTimer = null
  for (const op of dirty) listener(publicState(op))
  dirty.clear()
}

function newOp(root, branch, remote) {
  return {
    root, branch, remote,
    worktree: worktreePath(root, branch),
    stage: 'idle', busy: false,
    packages: [], ticket: null, projectId: null,
    steps: [], failed: null, review: null, commit: null, note: null
  }
}

/** Run one logged step. Resolves with its exit code; output streams into the log. */
function step(op, { kind, title, cmd, args, cwd, env, timeout = 120_000, display }) {
  const entry = {
    id: op.steps.length + 1, kind, title,
    cmd: display ?? [cmd, ...args].join(' '),
    startedAt: Date.now(), endedAt: null, code: null, output: '', truncated: false
  }
  op.steps.push(entry)
  emit(op, true)
  return new Promise((done) => {
    let child
    try {
      // Its own process group on macOS/Linux, so a timeout can stop what it
      // started too (git, ssh, php) — not just the shell or wrapper on top.
      child = spawn(cmd, args, { cwd, env: env ?? GIT_ENV, windowsHide: true, detached: process.platform !== 'win32' })
    } catch (err) {
      entry.output = err.message
      entry.code = -1
      entry.endedAt = Date.now()
      emit(op, true)
      return done(-1)
    }
    // Redaction works on whole lines: a secret split across two chunks would
    // slip through if each chunk were redacted on its own.
    let partial = ''
    const append = (text) => {
      entry.output += redact(clean(text))
      if (entry.output.length > MAX_OUTPUT) {
        entry.output = entry.output.slice(-MAX_OUTPUT)
        entry.truncated = true
      }
    }
    const add = (chunk) => {
      const text = partial + String(chunk).replace(/\r(?!\n)/g, '\n')
      const cut = text.lastIndexOf('\n')
      partial = cut === -1 ? text : text.slice(cut + 1)
      if (cut !== -1) append(text.slice(0, cut + 1))
      // A progress line with no newline yet, grown long: let it through.
      if (partial.length > 4000) {
        append(partial)
        partial = ''
      }
      emit(op)
    }
    const end = () => {
      if (partial) append(partial)
      partial = ''
    }
    child.stdout.on('data', add)
    child.stderr.on('data', add)
    let killer = null
    const timer = setTimeout(() => {
      add(`\n[timed out after ${Math.round(timeout / 1000)}s]\n`)
      stop(child, 'SIGTERM')
      // Whatever ignores the polite request gets the other kind.
      killer = setTimeout(() => stop(child, 'SIGKILL'), 5000)
    }, timeout)
    let settled = false
    const settle = (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearTimeout(killer)
      end()
      entry.code = typeof code === 'number' ? code : -1
      entry.endedAt = Date.now()
      emit(op, true)
      done(entry.code)
    }
    child.on('error', (err) => {
      add(`\n${err.message}\n`)
      settle(-1)
    })
    child.on('close', settle)
    // A grandchild can hold the output pipe open after the process itself has
    // gone (php under cmd.exe, a lingering ssh); don't wait on it forever.
    child.on('exit', (code) => setTimeout(() => settle(code), 2000))
  })
}

/** Stop a step's process and everything it started. */
function stop(child, signal) {
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true })
    } else {
      process.kill(-child.pid, signal)
    }
  } catch {
    try {
      child.kill(signal)
    } catch {}
  }
}

function fail(op, entry, message) {
  op.stage = 'failed'
  op.failed = { stepId: entry?.id ?? null, kind: entry?.kind ?? null, message }
  op.busy = false
  emit(op, true)
}

const lastStep = (op) => op.steps.at(-1)

/**
 * A log wants the lines, not the animation: progress output redraws with
 * backspaces, carriage returns and rows of spaces. And no output may carry a
 * control sequence any further — it ends up in a prompt that can be pasted into
 * a terminal, where `ESC[201~` would end the paste and the rest would be typed
 * as live input. So every escape sequence and control character goes, keeping
 * only newlines and tabs.
 */
export const clean = (text) =>
  String(text)
    .replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g, '') // CSI, including ESC[201~
    .replace(/\x9b[0-?]*[ -\/]*[@-~]/g, '') // the same as a single 8-bit byte
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g, '') // OSC
    .replace(/\x1b[\s\S]?/g, '') // any other escape
    .replace(/\r(?!\n)/g, '\n')
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '') // C0 and C1 controls, but \n and \t
    .replace(/^[ \t]{20,}/gm, '')

/** Is the worktree registered with the project repo, and where is the branch checked out? */
async function worktrees(root) {
  const r = await git(root, ['worktree', 'list', '--porcelain'])
  const list = []
  let cur = null
  for (const line of r.out.split('\n')) {
    if (line.startsWith('worktree ')) list.push((cur = { path: line.slice(9), branch: null }))
    else if (line.startsWith('branch ') && cur) cur.branch = line.slice(7)
  }
  return list
}

async function prepareWorktree(op) {
  const { root, remote, branch, worktree } = op
  if (await step(op, { kind: 'prepare', title: `Fetch ${remote}`, cmd: 'git', args: ['fetch', '--quiet', remote], cwd: root, timeout: 90_000 })) {
    return fail(op, lastStep(op), `Could not fetch ${remote}.`)
  }
  const target = `refs/remotes/${remote}/${branch}`
  const registered = (await worktrees(root)).some((w) => resolve(w.path) === resolve(worktree))
  if (registered && existsSync(worktree)) {
    // The deck's own scratch checkout: starting over may throw away what it holds.
    if (await step(op, { kind: 'prepare', title: `Reset worktree to ${remote}/${branch}`, cmd: 'git', args: ['checkout', '--quiet', '--force', '--detach', target], cwd: worktree })) {
      return fail(op, lastStep(op), 'Could not reset the worktree.')
    }
    if (await resetHard(op, target)) return fail(op, lastStep(op), 'Could not clean the worktree.')
    return true
  }
  // A folder left behind without git knowing it (a crash, a manual delete of
  // .git): only ever removed when it is inside the deck's own worktree dir.
  await git(root, ['worktree', 'prune'])
  if (existsSync(worktree) && isInside(WORKTREES, worktree)) rmSync(worktree, { recursive: true, force: true })
  if (await step(op, { kind: 'prepare', title: 'Create worktree', cmd: 'git', args: ['worktree', 'add', '--detach', worktree, target], cwd: root })) {
    return fail(op, lastStep(op), 'Could not create the worktree.')
  }
  return true
}

/**
 * Back to exactly the remote branch: tracked changes reset, and untracked and
 * ignored files gone too (a vendor/ from a fix, a copied auth.json). Only ever
 * in the deck's own worktree. Returns the first non-zero exit code.
 */
async function resetHard(op, target) {
  if (!isInside(WORKTREES, op.worktree)) return -1
  return (
    (await step(op, { kind: 'prepare', title: 'Clean worktree', cmd: 'git', args: ['reset', '--quiet', '--hard', target], cwd: op.worktree })) ||
    (await step(op, { kind: 'prepare', title: 'Remove untracked files', cmd: 'git', args: ['clean', '-fdxq'], cwd: op.worktree }))
  )
}

/**
 * Credentials kept out of git (a gitignored auth.json in the project root)
 * never reach a worktree by checkout. Copied in, untracked — so `git add
 * --update` never commits it, and the next clean removes it again.
 */
export function copyAuth(root, dir) {
  const own = join(root, 'auth.json')
  const there = join(dir, 'auth.json')
  if (!existsSync(own) || existsSync(there)) return false
  try {
    copyFileSync(own, there)
    return true
  } catch {
    return false
  }
}

async function runUpdate(op) {
  const command = composerCommand(op.projectId)
  if (!command) return fail(op, null, 'Composer was not found. Install it, or start the session from a Local site.')
  copyAuth(op.root, op.worktree)
  writeMeta(op)
  // No scripts and no plugins: there is no vendor/ here, so a post-update script
  // would fail (and could have side effects), and only the lock is wanted.
  const args = [...command.pre, 'update', ...op.packages, '--no-install', '--no-scripts', '--no-plugins', '--no-interaction', '--no-ansi']
  const code = await step(op, {
    kind: 'update',
    title: 'composer update',
    cmd: command.cmd,
    args,
    cwd: op.worktree,
    env: composerEnv(command),
    timeout: 600_000,
    display: updateCommand(op.packages)
  })
  if (code) return fail(op, lastStep(op), `composer update failed on ${op.branch} (exit ${code}).`)
  await toReview(op)
}

/** Work out what changed, and stop at review — or at nothing to do. */
async function toReview(op, { resumed = false } = {}) {
  const before = (await git(op.worktree, ['show', 'HEAD:composer.lock'])).out
  let after = ''
  try {
    after = readFileSync(join(op.worktree, 'composer.lock'), 'utf8')
  } catch {}
  const files = (await git(op.worktree, ['status', '--porcelain', '--untracked-files=no'])).out
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3))
  if (!files.length) {
    op.stage = 'idle'
    op.review = null
    // Composer warns and exits 0 for a package it can't update; pass that on.
    const said = (op.steps.findLast((s) => s.kind === 'update')?.output ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /not locked|does not match|not found|Nothing to modify/i.test(l))
    op.note = ['Nothing changed: the lock already has the newest versions composer.json allows.', ...said].join(' ')
    op.busy = false
    return emit(op, true)
  }
  let changes = []
  try {
    changes = lockChanges(before, after)
  } catch {}
  const picked = new Set(op.packages)
  op.review = {
    changes,
    // A shared dependency can move along; worth seeing before committing.
    unexpected: resumed ? [] : changes.map((c) => c.name).filter((n) => !picked.has(n)),
    files,
    otherFiles: files.filter((f) => f !== 'composer.lock'),
    message: op.review?.message ?? defaultCommitMessage(op.ticket, op.packages.length ? op.packages : changes.map((c) => c.name))
  }
  op.stage = 'review'
  op.note = null
  op.busy = false
  emit(op, true)
}

// ------------------------------------------------------------------ actions

function guard(op) {
  if (op.busy) throw new Error('Already running.')
  op.busy = true
}

const starting = new Set() // keys between "start" and the op being registered

export async function startUpdate({ root, branch, remote, packages, ticket, projectId }) {
  const bad = packages.find((p) => !isPackageName(p))
  if (bad || !packages.length) throw new Error(bad ? `Not a package name: ${bad}` : 'No packages selected.')
  const key = keyOf(root, branch)
  // Claimed before the first await: a double click must not start two runs in
  // one worktree while the first is still looking at what is on disk.
  if (starting.has(key)) throw new Error('Already running.')
  starting.add(key)
  try {
    return await begin({ key, root, branch, remote, packages, ticket, projectId })
  } finally {
    starting.delete(key)
  }
}

async function begin({ key, root, branch, remote, packages, ticket, projectId }) {
  // Never start over work in progress: the reset would throw it away. What is
  // in memory decides, and after a restart the worktree itself.
  const prev = ops.get(key) ?? (await opState({ root, branch, remote }) && ops.get(key))
  if (prev?.busy) throw new Error('Already running.')
  if (prev && prev.stage !== 'pushed' && (prev.stage === 'review' || prev.stage === 'committed' || prev.commit)) {
    throw new Error(
      prev.stage === 'review'
        ? `${branch} has an updated lock that is not committed yet. Commit it, or Discard it first.`
        : `${branch} has a commit that is not pushed yet. Push it, or Undo and Discard it first.`
    )
  }
  const op = newOp(root, branch, remote)
  Object.assign(op, { packages, ticket, projectId, stage: 'running', busy: true })
  ops.set(key, op)
  emit(op, true)
  if (await prepareWorktree(op)) await runUpdate(op)
  return publicState(op)
}

export async function commit({ root, branch, message }) {
  const op = ops.get(keyOf(root, branch))
  if (!op || op.stage !== 'review') throw new Error('Nothing to commit.')
  const text = String(message ?? '').trim()
  if (!text || text.length > 2000) throw new Error('A commit message is needed.')
  guard(op)
  op.review.message = text
  op.stage = 'running'
  emit(op, true)
  // Tracked files only: the update touches composer.lock, and a fix made in the
  // worktree may have touched composer.json. Nothing untracked is swept in.
  if (await step(op, { kind: 'commit', title: 'Stage changes', cmd: 'git', args: ['add', '--update'], cwd: op.worktree })) {
    return fail(op, lastStep(op), 'Could not stage the changes.')
  }
  if (await step(op, { kind: 'commit', title: 'Commit', cmd: 'git', args: ['commit', '-m', text], cwd: op.worktree, display: `git commit -m ${JSON.stringify(text)}` })) {
    return fail(op, lastStep(op), 'The commit failed.')
  }
  await toCommitted(op)
  return publicState(op)
}

async function toCommitted(op) {
  const target = `refs/remotes/${op.remote}/${op.branch}`
  const [sha, subject, ahead] = await Promise.all([
    git(op.worktree, ['rev-parse', '--short', 'HEAD']),
    git(op.worktree, ['log', '-1', '--format=%s']),
    git(op.worktree, ['rev-list', '--count', `${target}..HEAD`])
  ])
  op.commit = { sha: sha.out.trim(), message: subject.out.trim(), ahead: Number(ahead.out.trim()) || 1 }
  op.stage = 'committed'
  op.busy = false
  op.failed = null
  emit(op, true)
}

export async function push({ root, branch }) {
  const op = ops.get(keyOf(root, branch))
  if (!op || op.stage !== 'committed') throw new Error('Nothing to push.')
  guard(op)
  op.stage = 'running'
  emit(op, true)
  const code = await step(op, {
    kind: 'push',
    title: `Push to ${op.remote}/${op.branch}`,
    cmd: 'git',
    args: ['push', op.remote, `HEAD:refs/heads/${op.branch}`],
    cwd: op.worktree,
    timeout: 120_000
  })
  if (code) {
    return fail(op, lastStep(op), `The push to ${op.remote}/${op.branch} failed. If the branch moved meanwhile, discard and update again.`)
  }
  forgetFetch(op.root)
  op.stage = 'pushed'
  op.busy = false
  op.failed = null
  emit(op, true)
  return publicState(op)
}

/** Back from "committed" to "review": the commit goes, its changes stay. */
export async function undoCommit({ root, branch }) {
  const op = ops.get(keyOf(root, branch))
  if (!op || op.stage !== 'committed') throw new Error('No commit to undo.')
  guard(op)
  if (await step(op, { kind: 'undo', title: 'Undo commit', cmd: 'git', args: ['reset', '--soft', 'HEAD~1'], cwd: op.worktree })) {
    return fail(op, lastStep(op), 'Could not undo the commit.')
  }
  op.commit = null
  await toReview(op)
  return publicState(op)
}

/** Throw away whatever the worktree holds; the next update starts clean. */
export async function discard({ root, branch }) {
  const op = ops.get(keyOf(root, branch))
  if (!op) return null
  if (op.busy) throw new Error('Still running.')
  if (existsSync(op.worktree) && isInside(WORKTREES, op.worktree)) {
    const reset = await git(op.worktree, ['reset', '--quiet', '--hard', `refs/remotes/${op.remote}/${op.branch}`])
    if (reset.code) throw new Error(`Could not reset the worktree: ${reset.err.trim()}`)
    await git(op.worktree, ['clean', '-fdxq'])
  }
  rmSync(metaPath(op.worktree), { force: true })
  ops.delete(keyOf(root, branch))
  const fresh = newOp(root, branch, op.remote)
  listener(publicState(fresh))
  return publicState(fresh)
}

/**
 * Run the failed step again, in the same worktree — so a fix made there in
 * the meantime (by Claude, say) is kept.
 */
export async function retry({ root, branch }) {
  const op = ops.get(keyOf(root, branch))
  if (!op || op.stage !== 'failed') throw new Error('Nothing to retry.')
  const kind = op.failed?.kind
  op.failed = null
  if (kind === 'commit') {
    op.stage = 'review'
    return commit({ root, branch, message: op.review?.message })
  }
  if (kind === 'push') {
    op.stage = 'committed'
    return push({ root, branch })
  }
  if (kind === 'undo') {
    op.stage = 'committed'
    return undoCommit({ root, branch })
  }
  guard(op)
  op.stage = 'running'
  emit(op, true)
  // A failed update reruns in the same worktree, keeping a fix made there.
  // Only a failed preparation (or a missing worktree) starts over from the remote.
  if (kind === 'update' && existsSync(op.worktree)) await runUpdate(op)
  else if (await prepareWorktree(op)) await runUpdate(op)
  return publicState(op)
}

/**
 * The state for one environment. With nothing in memory (after a restart),
 * the worktree tells: an unpushed commit, or an updated lock not committed.
 */
export async function opState({ root, branch, remote }) {
  const key = keyOf(root, branch)
  if (ops.has(key)) return publicState(ops.get(key))
  const op = newOp(root, branch, remote)
  const registered = existsSync(op.worktree) && (await worktrees(root)).some((w) => resolve(w.path) === resolve(op.worktree))
  const meta = readMeta(op.worktree)
  if (meta?.branch === branch) Object.assign(op, { ticket: meta.ticket, packages: meta.packages })
  if (registered && remote) {
    const target = `refs/remotes/${remote}/${branch}`
    const ahead = Number((await git(op.worktree, ['rev-list', '--count', `${target}..HEAD`])).out.trim()) || 0
    if (ahead > 0) {
      ops.set(key, op)
      op.note = 'Found an unpushed commit from earlier.'
      await toCommitted(op)
      return publicState(op)
    }
    const changed = (await git(op.worktree, ['status', '--porcelain', '--untracked-files=no'])).out.trim()
    if (changed) {
      ops.set(key, op)
      // Without the picked packages there is no telling what moved unasked.
      await toReview(op, { resumed: !op.packages.length })
      op.note = 'Found an updated lock from earlier that was not committed.'
      return publicState(op)
    }
  }
  return publicState(op)
}

/** A prompt a Claude session can act on without asking anything back. */
export function promptFor({ root, branch }) {
  const op = ops.get(keyOf(root, branch))
  if (!op || op.stage !== 'failed') return null
  const entry = op.steps.find((s) => s.id === op.failed.stepId) ?? lastStep(op)
  const output = (entry?.output ?? '').trim()
  const tail = output.length > TAIL_FOR_PROMPT ? `…\n${output.slice(-TAIL_FOR_PROMPT)}` : output
  const fence = tail.includes('```') ? '~~~' : '```'
  return [
    `Updating composer.lock on the \`${branch}\` branch of ${root} failed${entry ? ` at the step "${entry.title}"` : ''}.`,
    '',
    `This ran in a separate git worktree, detached at ${op.remote}/${branch}, so my own checkout is untouched:`,
    `  ${op.worktree}`,
    entry ? `Command:\n  ${entry.cmd}` : null,
    op.packages.length ? `Packages: ${op.packages.join(', ')}.` : null,
    op.ticket ? `Ticket: ${op.ticket}.` : null,
    '',
    entry ? `It exited with code ${entry.code}. Output:` : op.failed.message,
    entry ? `${fence}\n${tail || '(no output)'}\n${fence}` : null,
    '',
    'Please find out why this fails. If the fix belongs in this project (composer.json, say), make it in that worktree.',
    'If the cause is outside it (PHP version, credentials, a package repository), tell me what I need to do instead.',
    'Do not commit or push: I review and commit from the Session Deck dialog, and retry the step there.'
  ]
    .filter((line) => line !== null)
    .join('\n')
}

const MAX_DIFF = 600_000

/**
 * Everything the worktree holds that the remote branch doesn't — the updated
 * lock before a commit, the commit after it. Read-only.
 */
export async function diff({ root, branch, remote }) {
  const worktree = worktreePath(root, branch)
  if (!existsSync(worktree)) return { text: '', truncated: false }
  const r = await git(worktree, ['diff', '--no-color', `refs/remotes/${remote}/${branch}`, '--'], { maxBuffer: 50_000_000 })
  const text = r.out
  return text.length > MAX_DIFF ? { text: text.slice(0, MAX_DIFF), truncated: true } : { text, truncated: false }
}

/** For the dialog to look up the remote of a project repo. */
export async function remoteOf(root) {
  return (await remotesOf(root))[0]?.name ?? null
}
