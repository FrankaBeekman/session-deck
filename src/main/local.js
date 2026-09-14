import { homedir } from 'os'
import { join } from 'path'
import { readFileSync, existsSync } from 'fs'

/** Local stores some site paths with a literal, unexpanded `~`. */
function expandTilde(p) {
  if (!p) return ''
  return p.startsWith('~') ? join(homedir(), p.slice(1)) : p
}

const LOCAL_DIR = join(homedir(), 'Library', 'Application Support', 'Local')
const SITES_JSON = join(LOCAL_DIR, 'sites.json')
const SSH_ENTRY = join(LOCAL_DIR, 'ssh-entry')

/**
 * Local owns this data; we only ever read it.
 * The `cd` inside each ssh-entry script is authoritative for the project path —
 * site paths are inconsistent across machines, so never derive one from the name.
 */
export function listProjects() {
  if (!existsSync(SITES_JSON)) return []

  const sites = JSON.parse(readFileSync(SITES_JSON, 'utf8'))

  return Object.entries(sites)
    .map(([id, site]) => ({
      id,
      name: site.name ?? id,
      path: expandTilde(site.path),
      domain: site.domain ?? '',
      // services.php.version is set on every site; the top-level phpVersion is a
      // legacy field present on only a couple of them.
      phpVersion: site.services?.php?.version ?? site.phpVersion ?? '',
      entryScript: join(SSH_ENTRY, `${id}.sh`)
    }))
    .filter((p) => existsSync(p.entryScript))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function getProject(id) {
  return listProjects().find((p) => p.id === id) ?? null
}
