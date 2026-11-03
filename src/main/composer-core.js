/**
 * Composer updates per environment — the pure part. No Electron, no child
 * processes, so it can be reasoned about (and tested) on its own, like
 * update-core.js and launch-script.js.
 *
 * A project's environments are its own branches (develop, staging, master, or
 * whatever the team uses), configured as a workflow. Which branch of a
 * *package* belongs to an environment is never configured: the lock file on
 * that environment's branch says it. `dev-staging` means the package's
 * `staging` branch; `1.5.0` means a tag.
 */

/** Built in, read-only. A custom workflow starts as a copy of one of these. */
export const PRESETS = [
  {
    id: 'current',
    name: 'Current branch only',
    preset: true,
    // Resolved at runtime to whatever branch the project repo has checked out.
    environments: null
  },
  {
    id: 'test-staging-live',
    name: 'Test, staging, live',
    preset: true,
    environments: [
      { label: 'Test', branch: 'develop' },
      { label: 'Staging', branch: 'staging' },
      { label: 'Live', branch: 'master' }
    ]
  }
]

export const DEFAULT_WORKFLOW_ID = 'current'

const MAX_WORKFLOWS = 20
const MAX_ENVIRONMENTS = 8
// What git accepts in a branch name, give or take: enough to refuse anything
// that could be read as an option or a revision range when it reaches git.
const BRANCH = /^(?!-)(?!.*\.\.)[A-Za-z0-9._/-]{1,100}$/

export function isBranchName(name) {
  return BRANCH.test(String(name ?? '')) && !String(name).endsWith('/') && !String(name).endsWith('.lock')
}

function cleanEnvironment(env) {
  const branch = String(env?.branch ?? '').trim()
  if (!isBranchName(branch)) return null
  const label = String(env?.label ?? '').trim().slice(0, 30) || branch
  return { label, branch }
}

/**
 * Settings as stored: `{ defaultId, custom: [{ id, name, environments }], overrides: { projectKey: id } }`.
 * Anything malformed is dropped rather than refused whole, so one bad row from
 * the editor never loses the rest.
 */
export function normalizeWorkflowSettings(raw) {
  const custom = []
  const ids = new Set(PRESETS.map((p) => p.id))
  for (const w of Array.isArray(raw?.custom) ? raw.custom.slice(0, MAX_WORKFLOWS) : []) {
    const id = String(w?.id ?? '').trim()
    if (!/^custom-[a-z0-9-]{1,40}$/.test(id) || ids.has(id)) continue
    const environments = (Array.isArray(w.environments) ? w.environments : [])
      .slice(0, MAX_ENVIRONMENTS)
      .map(cleanEnvironment)
      .filter(Boolean)
    ids.add(id)
    custom.push({ id, name: String(w.name ?? '').trim().slice(0, 40) || 'Custom', environments })
  }
  const defaultId = ids.has(raw?.defaultId) ? raw.defaultId : DEFAULT_WORKFLOW_ID
  const overrides = {}
  for (const [key, id] of Object.entries(raw?.overrides ?? {})) {
    if (typeof key === 'string' && key && ids.has(id)) overrides[key] = id
  }
  return { defaultId, custom, overrides }
}

export function allWorkflows(settings) {
  return [...PRESETS, ...settings.custom]
}

/** The workflow a project uses: its override, else the default. */
export function resolveWorkflow(settings, projectKey) {
  const all = allWorkflows(settings)
  const overrideId = settings.overrides[projectKey]
  const id = overrideId ?? settings.defaultId
  const workflow = all.find((w) => w.id === id) ?? PRESETS[0]
  return { ...workflow, source: overrideId ? 'project' : 'default' }
}

/** Environments to show, with "current branch" made concrete. */
export function environmentsFor(workflow, currentBranch) {
  if (workflow.environments) return workflow.environments
  return currentBranch && currentBranch !== 'HEAD' ? [{ label: currentBranch, branch: currentBranch }] : []
}

/**
 * `git@host:a/b.git`, `ssh://git@host/a/b.git` and `https://host/a/b` are the
 * same repository. Lowercased: hosts are case-insensitive, and the common hosts
 * treat paths that way too.
 */
export function normalizeRemote(url) {
  let s = String(url ?? '').trim()
  if (!s) return ''
  const scp = s.match(/^[^@/\s]+@([^:/\s]+):(.+)$/)
  if (scp) s = `${scp[1]}/${scp[2]}`
  else s = s.replace(/^[a-z+]+:\/\//i, '').replace(/^[^@/]+@/, '')
  return s
    .replace(/:\d+\//, '/')
    .replace(/\.git\/?$/i, '')
    .replace(/\/+$/, '')
    .toLowerCase()
}

/** The lock's packages, with the branch a `dev-…` version tracks. */
export function parseLock(text) {
  const lock = typeof text === 'string' ? JSON.parse(text) : text
  const out = []
  for (const [list, dev] of [[lock?.packages, false], [lock?.['packages-dev'], true]]) {
    for (const p of Array.isArray(list) ? list : []) {
      if (!p?.name) continue
      const version = String(p.version ?? '')
      const isBranch = version.startsWith('dev-')
      // A lock is repository content: only a commit hash may reach git as a
      // revision, and only a plain branch name as a branch, never an option.
      const ref = p.source?.reference ?? p.dist?.reference ?? null
      const branch = isBranch ? version.slice(4) : null
      out.push({
        name: p.name,
        version,
        ref: typeof ref === 'string' && /^[0-9a-f]{7,40}$/i.test(ref) ? ref : null,
        url: p.source?.url ?? null,
        sourceType: p.source?.type ?? null,
        devBranch: branch && isBranchName(branch) ? branch : null,
        devOnly: dev
      })
    }
  }
  return out
}

/**
 * What `composer.json` requires directly (require and require-dev), as
 * name -> constraint.
 */
export function directRequires(text) {
  const json = typeof text === 'string' ? JSON.parse(text) : text
  const out = new Map()
  for (const key of ['require', 'require-dev']) {
    for (const [name, constraint] of Object.entries(json?.[key] ?? {})) {
      // Platform requirements are not packages.
      if (name === 'php' || name.startsWith('ext-') || name.startsWith('lib-') || name === 'composer-plugin-api') continue
      out.set(name, String(constraint ?? ''))
    }
  }
  return out
}

/**
 * How tightly composer.json holds a package:
 *   pinned  one exact version (`2.10.5`, `=1.4.0`, `v3.1`) — `composer update`
 *           can never move it; only editing composer.json can
 *   branch  a branch (`dev-develop`, `2.x-dev`), optionally `#<commit>`
 *   open    no upper limit (`>=6`, `*`) — an update can jump a major version
 *   range   anything else (`^2.1`, `~1.4`, `6.9.*`, `>=1 <2`)
 */
export function constraintKind(constraint) {
  const c = String(constraint ?? '').trim()
  if (!c) return null
  if (/^(dev-\S+|\S+-dev)(#\S+)?$/i.test(c) || /#[0-9a-f]{7,40}$/i.test(c)) return /#/.test(c) ? 'pinned' : 'branch'
  if (/^(==?)?\s*v?\d+(\.\d+){0,3}(-(alpha|beta|rc|patch|p)\.?\d*)?(@\w+)?$/i.test(c)) return 'pinned'
  // Every alternative (`a || b`) needs an upper bound, or the whole is open.
  const alternatives = c.split('||').map((a) => a.trim())
  if (alternatives.some((a) => a === '*' || a === 'x' || (/>/.test(a) && !/</.test(a)))) return 'open'
  return 'range'
}

/**
 * Tie repos a session edited to the lock's packages: by remote URL first, by
 * the repo's own composer.json name second.
 * repos: [{ root, remotes: [url], name }]
 */
export function matchRepos(repos, packages) {
  const byUrl = new Map()
  for (const p of packages) {
    const key = normalizeRemote(p.url)
    if (key) byUrl.set(key, p.name)
  }
  const names = new Set(packages.map((p) => p.name))
  const matches = new Map() // package name -> repo
  for (const repo of repos) {
    const viaUrl = repo.remotes.map((u) => byUrl.get(normalizeRemote(u))).find(Boolean)
    const name = viaUrl ?? (names.has(repo.name) ? repo.name : null)
    if (name && !matches.has(name)) matches.set(name, repo)
  }
  return matches
}

export const shortRef = (ref) => (ref ? String(ref).slice(0, 7) : null)

/**
 * Where the ticket's work stands for one package on one environment.
 *   in-lock     the locked commit contains it
 *   behind      merged (or released) but the lock is older
 *   untagged    merged, but the lock follows tags and none contains it yet
 *   not-merged  the package's branch doesn't have it yet
 *   absent      this environment's lock has no such package
 *   unknown     no ticket branch, or the repo couldn't be read
 */
export const STATUS_RANK = { 'not-merged': 0, untagged: 1, behind: 2, unknown: 3, absent: 4, 'in-lock': 5 }

/** A tab's dot: the least advanced of the ticket's packages there. */
export function worstStatus(statuses) {
  const real = statuses.filter((s) => s && s !== 'absent' && s !== 'unknown')
  if (!real.length) return null
  return real.reduce((a, b) => (STATUS_RANK[b] < STATUS_RANK[a] ? b : a))
}

/**
 * `composer outdated --format=json` → `{ name: { latest, status } }`. With
 * `--locked` the list is under "locked", otherwise "installed".
 */
export function parseOutdated(text) {
  const json = typeof text === 'string' ? JSON.parse(text.slice(text.indexOf('{'))) : text
  const list = json?.locked ?? json?.installed ?? []
  const out = {}
  for (const p of Array.isArray(list) ? list : []) {
    if (!p?.name) continue
    out[p.name] = { latest: p.latest ?? null, status: p['latest-status'] ?? null, abandoned: Boolean(p.abandoned) }
  }
  return out
}

/** The command the user would run, for the dialog's preview and copy button. */
export function updateCommand(packages) {
  return packages.length ? `composer update ${packages.join(' ')} --no-install --no-scripts --no-plugins` : null
}

/** A version for display: a branch with its commit, a tag as it is. */
const shown = (p) => (p ? (p.devBranch && p.ref ? `${p.version} ${shortRef(p.ref)}` : p.version) : null)

/**
 * What an update changed in the lock: `[{ name, from, to }]`, with `from` or
 * `to` null for a package that appeared or went away.
 */
export function lockChanges(beforeText, afterText) {
  const index = (text) => new Map(parseLock(text).map((p) => [p.name, p]))
  const before = index(beforeText)
  const after = index(afterText)
  const changes = []
  for (const name of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(name)
    const b = after.get(name)
    if (a && b && a.version === b.version && a.ref === b.ref) continue
    changes.push({ name, from: shown(a), to: shown(b) })
  }
  return changes.sort((x, y) => x.name.localeCompare(y.name))
}

/** A package name as Composer accepts it, and nothing that could read as an option. */
export function isPackageName(name) {
  return /^[a-z0-9]([_.-]?[a-z0-9]+)*\/[a-z0-9](([_.]|-{1,2})?[a-z0-9]+)*$/i.test(String(name ?? ''))
}

/** `MERIDE-413 composer update meride-theme, quotation-block` — description plus ticket ID. */
export function defaultCommitMessage(ticket, packages) {
  const short = packages.map((p) => p.split('/').pop())
  return `${ticket ? `${ticket} ` : ''}composer update ${short.join(', ')}`
}

/**
 * Does a branch name carry this ticket key? On a boundary: on MERIDE-41,
 * `feature/MERIDE-41-fix` does, `feature/MERIDE-413` and `MERIDE-410` don't.
 */
export function namesTicket(name, ticketKey) {
  if (!ticketKey) return false
  const key = String(ticketKey).replace(/[^A-Za-z0-9-]/g, '')
  return new RegExp(`(^|[^A-Za-z0-9])${key}(?![0-9])`, 'i').test(String(name ?? ''))
}
