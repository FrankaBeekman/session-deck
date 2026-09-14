#!/usr/bin/env node
/**
 * node-pty ships NAPI prebuilds, but npm extraction drops the execute bit from
 * `spawn-helper`. node-pty spawns that helper via posix_spawnp, so without +x
 * every launch dies with the famously unhelpful "posix_spawnp failed".
 *
 * Also warns when build/Release holds a native build for a different
 * architecture than the Electron that will load it -- which happens on this
 * machine because Node runs x64 under Rosetta while Electron is arm64.
 */
import { chmodSync, existsSync, readdirSync, statSync, readFileSync } from 'fs'
import { join } from 'path'

const PREBUILDS = join(process.cwd(), 'node_modules', 'node-pty', 'prebuilds')
const BUILD = join(process.cwd(), 'node_modules', 'node-pty', 'build', 'Release')

if (!existsSync(PREBUILDS)) {
  console.log('[fix-node-pty] no prebuilds directory; nothing to do')
  process.exit(0)
}

let fixed = 0
for (const dir of readdirSync(PREBUILDS)) {
  const helper = join(PREBUILDS, dir, 'spawn-helper')
  if (!existsSync(helper)) continue
  const mode = statSync(helper).mode
  if ((mode & 0o111) === 0) {
    chmodSync(helper, 0o755)
    console.log(`[fix-node-pty] +x ${dir}/spawn-helper`)
    fixed++
  }
}
console.log(`[fix-node-pty] ${fixed} helper(s) made executable`)

// A stale build/Release for the wrong arch can shadow the correct prebuild.
if (existsSync(join(BUILD, 'pty.node'))) {
  const head = readFileSync(join(BUILD, 'pty.node')).subarray(0, 8)
  const cpu = head.readUInt32LE(4)
  const arch = cpu === 0x0100000c ? 'arm64' : cpu === 0x01000007 ? 'x64' : `cpu:${cpu}`
  console.log(`[fix-node-pty] note: node_modules/node-pty/build/Release holds a ${arch} build.`)
  console.log('[fix-node-pty]       Delete that directory if Electron is a different arch.')
}
