import { execFile } from 'child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { basename, delimiter, dirname, join, resolve } from 'path'
import { isInside, IS_WIN } from './platform.js'
import { resolveComposerBin } from './claude-bin.js'
import { localComposer } from './local.js'
import {
  constraintKind,
  directRequires,
  namesTicket,
  environmentsFor,
  isBranchName,
  matchRepos,
  normalizeRemote,
  parseLock,
  parseOutdated,
  shortRef,
  STATUS_RANK,
  worstStatus
} from './composer-core.js'

/**
 * Composer updates per environment — reading. Everything the dialog shows on
 * opening comes from git: the lock on each environment branch, and whether the
 * ticket's work is in it. Composer itself runs only for "Check for updates".
 *
 * Nothing here touches a working tree. Branches are read with `git show`, and
 * Composer runs against copies of composer.json/lock in a temp dir.
 */

const FETCH_TTL = 60_000 // a dialog reopened within a minute does not fetch again
const lastFetch = new Map() // repo root -> time

function run(cmd, args, { cwd, timeout = 15_000, env, maxBuffer = 20_000_000 } = {}) {
  return new Promise((r) => {
    try {
      execFile(cmd, args, { cwd, timeout, env, maxBuffer, windowsHide: true }, (err, stdout, stderr) => {
        r({ code: err ? (typeof err.code === 'number' ? err.code : -1) : 0, out: stdout ?? '', err: stderr || err?.message || '' })
      })
    } catch (err) {
      // A cwd that is not a directory throws here instead of calling back.
      r({ code: -1, out: '', err: err.message })
    }
  })
}

// Never prompt for credentials: a GUI app has nobody to answer. SSH is left as
// the user set it up (core.sshCommand, GIT_SSH, an agent such as 1Password's):
// overriding GIT_SSH_COMMAND would beat all of those. Without a terminal, ssh
// cannot ask for a passphrase anyway, and every step has a timeout.
export const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
export const git = (cwd, args, opts = {}) => run('git', args, { cwd, env: GIT_ENV, ...opts })

/** After a push the remote has moved: the next read must fetch again. */
export function forgetFetch(root) {
  for (const key of lastFetch.keys()) if (key.startsWith(`${root}\0`)) lastFetch.delete(key)
}

async function fetchOnce(root, remote) {
  const key = `${root}\0${remote}`
  if (Date.now() - (lastFetch.get(key) ?? 0) < FETCH_TTL) return { ok: true, cached: true }
  const r = await git(root, ['fetch', '--quiet', '--tags', remote], { timeout: 60_000 })
  if (r.code === 0) lastFetch.set(key, Date.now())
  return { ok: r.code === 0, error: r.code === 0 ? null : r.err.trim().split('\n').pop() }
}

/** The repo's remotes, `origin` first. */
export async function remotesOf(root) {
  const r = await git(root, ['remote', '-v'])
  const seen = new Map()
  for (const line of r.out.split('\n')) {
    const m = line.match(/^(\S+)\s+(\S+)\s+\(fetch\)/)
    if (m && !seen.has(m[1])) seen.set(m[1], m[2])
  }
  return [...seen].map(([name, url]) => ({ name, url })).sort((a, b) => (b.name === 'origin') - (a.name === 'origin'))
}

/**
 * The project repo: the outermost git repo with a composer.json between the
 * session's directory and the home folder. Outermost, because a theme or plugin
 * the session works in has a composer.json of its own, and is installed inside
 * the project.
 */
export function findProjectRoot(startDirs) {
  const home = homedir()
  let best = null
  for (const start of startDirs.filter(Boolean)) {
    let dir = resolve(start)
    while (dir && dir !== home && dir !== dirname(dir)) {
      if (existsSync(join(dir, 'composer.json')) && existsSync(join(dir, '.git'))) {
        if (!best || best.length > dir.length) best = dir
      }
      dir = dirname(dir)
    }
  }
  return best
}

/** The nearest repo for a path, as a `rev-parse --show-toplevel`. */
async function repoRootFor(path) {
  let dir = path
  while (dir && !existsSync(dir)) {
    const up = dirname(dir)
    if (up === dir) return null
    dir = up
  }
  try {
    if (!statSync(dir).isDirectory()) dir = dirname(dir)
  } catch {
    return null
  }
  const r = await git(dir, ['rev-parse', '--show-toplevel'])
  return r.code === 0 ? r.out.trim() || null : null
}

/**
 * While one composerState runs, the same read-only questions come up for every
 * environment and every ticket branch (is X in Y, what is the tip of Z). After
 * the fetch their answers can't change, so each is asked once.
 */
let memo = null
function readGit(root, args) {
  if (!memo) return git(root, args)
  const key = `${root}\0${args.join('\0')}`
  if (!memo.has(key)) memo.set(key, git(root, args))
  return memo.get(key)
}

async function refExists(root, ref) {
  const r = await readGit(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
  return r.code === 0 ? r.out.trim() : null
}

async function isAncestor(root, a, b) {
  const r = await readGit(root, ['merge-base', '--is-ancestor', a, b])
  return r.code === 0 ? true : r.code === 1 ? false : null
}

/** `origin/<branch>` when the remote has it, else the local branch. */
export async function branchRef(root, remote, branch) {
  if (remote && (await refExists(root, `refs/remotes/${remote}/${branch}`))) return `refs/remotes/${remote}/${branch}`
  if (await refExists(root, `refs/heads/${branch}`)) return `refs/heads/${branch}`
  return null
}

async function showFile(root, ref, file) {
  const r = await git(root, ['show', `${ref}:${file}`])
  return r.code === 0 ? r.out : null
}

/**
 * Where Composer put each package, when it installed it as a git clone: the
 * root composer.json's installer-paths, composer/installers' WordPress
 * defaults, and the vendor dir. Only the working tree's composer.json is read
 * here — install paths rarely differ between branches.
 */
function installedClones(projectRoot, packages) {
  let json = {}
  try {
    json = JSON.parse(readFileSync(join(projectRoot, 'composer.json'), 'utf8'))
  } catch {}
  const templates = [
    ...Object.keys(json.extra?.['installer-paths'] ?? {}),
    'wp-content/themes/{$name}',
    'wp-content/plugins/{$name}',
    'wp-content/mu-plugins/{$name}'
  ]
  const vendorDir = typeof json.config?.['vendor-dir'] === 'string' ? json.config['vendor-dir'] : 'vendor'
  const found = new Map() // root -> package name
  for (const p of packages) {
    if (!p.url || found.size > 200) continue
    const [vendor, name] = p.name.split('/')
    if (!name) continue
    const candidates = [
      ...templates.map((t) => t.replaceAll('{$name}', name).replaceAll('{$vendor}', vendor)),
      join(vendorDir, vendor, name)
    ]
    for (const rel of candidates) {
      const dir = resolve(projectRoot, rel)
      if (!isInside(projectRoot, dir) || dir === projectRoot) continue
      if (existsSync(join(dir, '.git'))) {
        found.set(dir, p.name)
        break
      }
    }
  }
  return found
}

/** Does this clone know a branch (local or fetched) named after the ticket? */
async function hasTicketBranch(root, ticketKey) {
  const r = await git(root, ['for-each-ref', '--format=%(refname)', 'refs/heads/', 'refs/remotes/'])
  return r.out.split('\n').some((ref) => namesTicket(ref, ticketKey))
}

/**
 * The ticket's packages, found two ways:
 * - repos edited in any session on this ticket (precise, but only known while
 *   the deck has been watching), and
 * - installed clones that have a branch named after the ticket — which still
 *   works days later, after a restart, or for work done outside the deck.
 * A branch only on the remote, never fetched into the clone, is missed by the
 * second; the first, or a fetch in that repo, covers it.
 */
async function ticketRepos(projectRoot, touchedPaths, ticketKey, packages) {
  const roots = new Map() // root -> 'edited' | 'branch'
  for (const p of touchedPaths) {
    const root = await repoRootFor(p)
    if (root && root !== projectRoot && isInside(projectRoot, root)) roots.set(root, 'edited')
  }
  if (ticketKey) {
    const clones = [...installedClones(projectRoot, packages).keys()].filter((r) => !roots.has(r))
    const hits = await Promise.all(clones.map((r) => hasTicketBranch(r, ticketKey)))
    clones.forEach((r, i) => hits[i] && roots.set(r, 'branch'))
  }
  const repos = []
  for (const [root, via] of roots) {
    let name = null
    try {
      name = JSON.parse(readFileSync(join(root, 'composer.json'), 'utf8')).name ?? null
    } catch {}
    const remotes = await remotesOf(root)
    repos.push({ root, name, via, remotes: remotes.map((r) => r.url), remoteList: remotes })
  }
  return repos
}

/** The remote in a package repo that points at the package's own URL. */
function remoteFor(repo, url, normalize) {
  const want = normalize(url)
  return repo.remoteList.find((r) => normalize(r.url) === want)?.name ?? repo.remoteList[0]?.name ?? null
}

/** Every remote branch whose name contains the ticket key, newest first. */
async function ticketTips(root, remote, ticketKey) {
  if (!ticketKey || !remote) return []
  const r = await git(root, ['for-each-ref', '--sort=-committerdate', '--format=%(refname:short)%09%(objectname)', `refs/remotes/${remote}/`])
  const tips = []
  for (const line of r.out.split('\n')) {
    const [ref, sha] = line.split('\t')
    if (ref && sha && namesTicket(ref, ticketKey)) tips.push({ ref: ref.slice(remote.length + 1), sha })
  }
  return tips
}

/** Where the ticket's work stands for one package on one environment. */
async function tipStatus({ repo, remote, tip, locked, envBranch }) {
  if (!locked) return { status: 'absent', text: 'not in this branch’s lock' }
  if (!repo) return { status: 'unknown', text: 'repository not found locally' }
  const newest = locked.devBranch ? await refExists(repo.root, `refs/remotes/${remote}/${locked.devBranch}`) : null
  const behindBy =
    newest && locked.ref && newest !== locked.ref
      ? Number((await readGit(repo.root, ['rev-list', '--count', `${locked.ref}..${newest}`])).out.trim()) || null
      : null
  const base = { newest: newest && newest !== locked.ref ? shortRef(newest) : null, behindBy }
  if (!tip) return { ...base, status: 'unknown', text: 'no branch for this ticket' }
  if (locked.ref && (await isAncestor(repo.root, tip.sha, locked.ref))) return { ...base, status: 'in-lock', text: 'in the lock' }
  if (locked.devBranch) {
    if (!newest) return { ...base, status: 'unknown', text: `branch ${locked.devBranch} not found` }
    return (await isAncestor(repo.root, tip.sha, newest))
      ? { ...base, status: 'behind', text: 'merged, lock behind' }
      : { ...base, status: 'not-merged', text: `not merged into ${locked.devBranch} yet` }
  }
  // Locked to a tag: released when a tag contains the work.
  const tags = await readGit(repo.root, ['tag', '--contains', tip.sha, '--sort=-v:refname'])
  const tag = tags.out.split('\n').map((t) => t.trim()).find(Boolean)
  if (tag) return { ...base, newest: tag, status: 'behind', text: `released in ${tag}, lock behind` }
  const target = (await refExists(repo.root, `refs/remotes/${remote}/${envBranch}`))
    ? `refs/remotes/${remote}/${envBranch}`
    : `refs/remotes/${remote}/HEAD`
  return (await isAncestor(repo.root, tip.sha, target))
    ? { ...base, status: 'untagged', text: 'merged, no release tag yet' }
    : { ...base, status: 'not-merged', text: 'not merged or released yet' }
}

/**
 * A ticket can have several branches (a follow-up for review feedback, say).
 * The package is only as far along as the least advanced of them.
 */
async function packageStatus({ repo, remote, tips, locked, envBranch }) {
  if (!tips.length) return { ...(await tipStatus({ repo, remote, tip: null, locked, envBranch })), tip: null }
  let worst = null
  for (const tip of tips) {
    const s = { ...(await tipStatus({ repo, remote, tip, locked, envBranch })), tip: tip.ref }
    if (!worst || STATUS_RANK[s.status] < STATUS_RANK[worst.status]) worst = s
  }
  if (tips.length > 1 && worst.status !== 'in-lock') worst.text = `${worst.tip}: ${worst.text}`
  return worst
}

/**
 * Everything the dialog shows on opening.
 * input: { startDirs, touched, ticketKey, workflow, outdatedFor(root, branch) }
 */
export async function composerState(input) {
  memo = new Map()
  try {
    return await readState(input)
  } finally {
    memo = null
  }
}

async function readState({ startDirs, touched, ticketKey, workflow, outdatedFor, pending = [] }) {
  const root = findProjectRoot(startDirs)
  if (!root) return { ok: false, error: 'No git repository with a composer.json was found for this session.' }

  const remotes = await remotesOf(root)
  const remote = remotes[0]?.name ?? null
  const warnings = []
  if (remote) {
    const f = await fetchOnce(root, remote)
    if (!f.ok) warnings.push(`Could not fetch ${basename(root)} (${f.error}); showing what was fetched before.`)
  }
  const current = (await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])).out.trim()
  // Branches with an update in progress stay reachable, even when they are no
  // environment any more ("Current branch only", after switching branches).
  const environments = [...environmentsFor(workflow, current)]
  for (const branch of pending) {
    if (!environments.some((e) => e.branch === branch)) environments.push({ label: branch, branch, pending: true })
  }

  // Read each environment's lock and requirements.
  const envs = []
  for (const env of environments) {
    const ref = isBranchName(env.branch) ? await branchRef(root, remote, env.branch) : null
    if (!ref) {
      envs.push({ ...env, missing: true, packages: [] })
      continue
    }
    const [lockText, jsonText] = await Promise.all([showFile(root, ref, 'composer.lock'), showFile(root, ref, 'composer.json')])
    let packages = []
    let direct = new Map()
    let error = null
    try {
      if (!lockText) throw new Error('no composer.lock on this branch')
      packages = parseLock(lockText)
      direct = jsonText ? directRequires(jsonText) : new Map()
    } catch (err) {
      error = err.message
    }
    // Read from a local branch when the remote has none; updating needs the remote one.
    envs.push({ ...env, ref, onRemote: ref.startsWith('refs/remotes/'), packages, direct, error })
  }

  // The ticket's packages, and where its work stands in each one.
  const allPackages = envs.flatMap((e) => e.packages)
  const repos = await ticketRepos(root, touched, ticketKey, allPackages)
  const matches = matchRepos(repos, allPackages)
  const ticketInfo = new Map() // name -> { repo, remote, tip }
  await Promise.all(
    [...matches].map(async ([name, repo]) => {
      const url = allPackages.find((p) => p.name === name)?.url
      const pkgRemote = remoteFor(repo, url, normalizeRemote)
      if (pkgRemote) {
        const f = await fetchOnce(repo.root, pkgRemote)
        if (!f.ok) warnings.push(`Could not fetch ${name} (${f.error}).`)
      }
      ticketInfo.set(name, { repo, remote: pkgRemote, tips: await ticketTips(repo.root, pkgRemote, ticketKey) })
    })
  )

  const result = await Promise.all(envs.map(async (env) => {
    const byName = new Map(env.packages.map((p) => [p.name, p]))
    const rows = await Promise.all([...ticketInfo].map(async ([name, info]) => {
      const locked = byName.get(name) ?? null
      const s = await packageStatus({ ...info, locked, envBranch: env.branch })
      const constraint = env.direct?.get(name) ?? null
      const pin = constraintKind(constraint)
      // A pinned package only moves by editing composer.json; say so where it matters.
      if (pin === 'pinned' && (s.status === 'behind' || s.status === 'untagged')) {
        s.text = `${s.text} — pinned to ${constraint} in composer.json`
      }
      return {
        name,
        ticket: true,
        version: locked?.version ?? null,
        ref: shortRef(locked?.ref),
        branches: info.tips.length,
        via: info.repo.via,
        constraint,
        pin,
        ...s
      }
    }))
    // Everything else composer.json asks for directly; transitive packages are
    // Composer's business. A lock without composer.json falls back to all.
    for (const p of env.packages) {
      if (ticketInfo.has(p.name)) continue
      if (env.direct?.size && !env.direct.has(p.name)) continue
      const constraint = env.direct?.get(p.name) ?? null
      rows.push({
        name: p.name,
        ticket: false,
        version: p.version,
        ref: shortRef(p.ref),
        devBranch: p.devBranch,
        constraint,
        pin: constraintKind(constraint)
      })
    }
    rows.sort((a, b) => Number(b.ticket) - Number(a.ticket) || a.name.localeCompare(b.name))
    return {
      label: env.label,
      branch: env.branch,
      pending: Boolean(env.pending),
      missing: Boolean(env.missing),
      onRemote: Boolean(env.onRemote),
      error: env.error ?? null,
      dot: worstStatus(rows.filter((r) => r.ticket).map((r) => r.status)),
      outdated: env.missing ? null : outdatedFor(root, env.branch),
      packages: rows
    }
  }))

  return {
    ok: true,
    root,
    current,
    ticket: ticketKey ?? null,
    ticketRepos: repos.length,
    unmatched: repos.filter((r) => ![...matches.values()].includes(r)).map((r) => basename(r.root)),
    environments: result,
    warnings
  }
}

/** How to run Composer for this project: the Local site's PHP when there is one. */
export function composerCommand(projectId) {
  const local = localComposer(projectId)
  if (local) return { cmd: local.php, pre: [local.phar], env: local.env }
  const bin = resolveComposerBin()
  if (!bin) return null
  if (IS_WIN && /\.(bat|cmd)$/i.test(bin)) return { cmd: 'cmd.exe', pre: ['/d', '/s', '/c', bin], env: {} }
  return { cmd: bin, pre: [], env: {} }
}

/**
 * A GUI app's PATH is minimal; Composer needs git (and php, for a phar with an
 * `env php` shebang).
 */
export function composerEnv(command) {
  const extra = [dirname(command.cmd), '/opt/homebrew/bin', '/usr/local/bin'].filter(existsSync)
  return { ...GIT_ENV, ...command.env, PATH: [...extra, process.env.PATH ?? ''].join(delimiter), COMPOSER_NO_INTERACTION: '1' }
}

/**
 * `composer outdated` for one environment branch, against copies of its
 * composer.json and lock — never the working tree, and never vendor/.
 */
export async function composerOutdated({ root, branch, projectId }) {
  if (!isBranchName(branch)) return { ok: false, error: 'Invalid branch name.' }
  const command = composerCommand(projectId)
  if (!command) return { ok: false, error: 'Composer was not found. Install it, or start the session from a Local site.' }

  const remote = (await remotesOf(root))[0]?.name ?? null
  const ref = await branchRef(root, remote, branch)
  if (!ref) return { ok: false, error: `Branch ${branch} not found.` }
  const files = ['composer.json', 'composer.lock', 'auth.json']
  const contents = await Promise.all(files.map((f) => showFile(root, ref, f)))
  if (!contents[0] || !contents[1]) return { ok: false, error: `${branch} has no composer.json and composer.lock.` }

  const dir = mkdtempSync(join(tmpdir(), 'deck-composer-'))
  try {
    files.forEach((f, i) => contents[i] && writeFileSync(join(dir, f), contents[i], { mode: 0o600 }))
    // A gitignored auth.json in the project root is what the user's own
    // checkout authenticates with; git show can't see it.
    if (!contents[2] && existsSync(join(root, 'auth.json'))) {
      writeFileSync(join(dir, 'auth.json'), readFileSync(join(root, 'auth.json')), { mode: 0o600 })
    }
    const env = composerEnv(command)
    const r = await run(
      command.cmd,
      [...command.pre, 'outdated', '--locked', '--direct', '--all', '--format=json', '--no-plugins', '--no-ansi', '--no-interaction'],
      { cwd: dir, env, timeout: 300_000 }
    )
    if (!r.out.includes('{')) {
      const lines = r.err.trim().split('\n').filter(Boolean)
      return { ok: false, error: lines.slice(-4).join('\n') || 'Composer failed without a message.' }
    }
    return { ok: true, at: Date.now(), results: parseOutdated(r.out) }
  } catch (err) {
    return { ok: false, error: err.message }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
