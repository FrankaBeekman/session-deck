import { app } from 'electron'
import { copyFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

/**
 * A globally installed MCP server needs a path that survives the app moving or
 * updating, so it points at ~/.session-deck/mcp-bridge.mjs. The app refreshes
 * that copy on start whenever its bundled bridge differs.
 */
export const BRIDGE_COPY = join(homedir(), '.session-deck', 'mcp-bridge.mjs')

export function bundledBridge() {
  return app.isPackaged
    ? join(process.resourcesPath, 'mcp-bridge.mjs')
    : join(__dirname, '../../src/main/mcp-bridge.mjs')
}

export function installBridgeCopy() {
  try {
    const src = bundledBridge()
    if (!existsSync(src)) return
    mkdirSync(join(homedir(), '.session-deck'), { recursive: true })
    const same = existsSync(BRIDGE_COPY) && readFileSync(BRIDGE_COPY, 'utf8') === readFileSync(src, 'utf8')
    if (!same) copyFileSync(src, BRIDGE_COPY)
  } catch (err) {
    console.error('[bridge] copy failed:', err.message)
  }
}
