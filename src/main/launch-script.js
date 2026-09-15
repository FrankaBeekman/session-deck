/**
 * The launcher script text, kept free of Electron and node-pty imports so it can
 * be exercised directly — it is the one piece that decides where a session
 * starts and which shell it believes it has.
 */

/** Single-quote for bash, so paths with spaces, $ or quotes stay literal. */
export const shq = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`

export function launcherScript({ claudeBin, idFlag, mcpConfigPath, workdir, shell }) {
  return [
    '#!/bin/bash',
    // SHELL was borrowed to get here (the Local trick); give Claude the real one.
    `export SHELL=${shq(shell)}`,
    workdir ? `cd ${shq(workdir)} || exit 1` : null,
    `exec ${shq(claudeBin)} ${idFlag}${mcpConfigPath ? ` --mcp-config ${shq(mcpConfigPath)}` : ''}`,
    ''
  ]
    .filter((line) => line !== null)
    .join('\n')
}
