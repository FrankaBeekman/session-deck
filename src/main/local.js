import { homedir } from 'os'
import { join, basename } from 'path'
import { isInside, localDataDir, entryScriptName, tildify as tildifyPath } from './platform.js'
import { readFileSync, existsSync } from 'fs'

/** Local stores some site paths with a literal, unexpanded `~`. */
function expandTilde(p) {
  if (!p) return ''
  return p.startsWith('~') ? join(homedir(), p.slice(1)) : p
}

const LOCAL_DIR = localDataDir()
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
      entryScript: join(SSH_ENTRY, entryScriptName(id))
    }))
    .filter((p) => existsSync(p.entryScript))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function getProject(id) {
  return listProjects().find((p) => p.id === id) ?? null
}

export function tildify(p) {
  return tildifyPath(p)
}

/**
 * The project for a session started in a chosen directory. Inside a Local site
 * it is that site — so the session still gets the site shell with WP-CLI and the
 * right PHP — just started in the chosen folder. The most specific site wins.
 * Anywhere else it is a plain directory project, keyed by its path.
 */
export function projectForDirectory(dir) {
  const site = listProjects()
    .filter((p) => isInside(p.path, dir))
    .sort((a, b) => b.path.length - a.path.length)[0]
  if (site) return { ...site, cwd: dir }
  return { id: null, name: basename(dir) || dir, domain: tildify(dir), path: dir, entryScript: null, cwd: dir }
}
