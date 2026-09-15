/**
 * The launcher script text, kept free of Electron and node-pty imports so it can
 * be exercised directly — it decides where a session starts and in which shell.
 */

/** Single-quote for bash, so paths with spaces, $ or quotes stay literal. */
export const shq = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`

/**
 * Double-quote for cmd.exe. Windows paths cannot contain `"`, but `%` would be
 * expanded as a variable inside a .cmd file, so it is doubled.
 */
export const cmdq = (v) => `"${String(v).replace(/%/g, '%%')}"`

function idArgs({ sessionId, resumeId }, quote) {
  return resumeId ? `--resume ${quote(resumeId)}` : `--session-id ${quote(sessionId)}`
}

/** macOS / Linux: bash, entered through Local's `exec $SHELL` or a login shell. */
export function launcherScript({ claudeBin, sessionId, resumeId, mcpConfigPath, workdir, shell }) {
  return [
    '#!/bin/bash',
    // SHELL was borrowed to get here (the Local trick); give Claude the real one.
    `export SHELL=${shq(shell)}`,
    workdir ? `cd ${shq(workdir)} || exit 1` : null,
    `exec ${shq(claudeBin)} ${idArgs({ sessionId, resumeId }, shq)}${mcpConfigPath ? ` --mcp-config ${shq(mcpConfigPath)}` : ''}`,
    ''
  ]
    .filter((line) => line !== null)
    .join('\n')
}

/**
 * Windows: one cmd.exe session. Local's site .bat only sets PATH, PHPRC and
 * friends and cd's into the site — unlike the macOS script it does not end by
 * starting a shell — so it can simply be `call`ed, and Claude started after it
 * inherits that environment. `call` is also what makes a .cmd npm shim for
 * claude return control instead of ending the script.
 */
export function windowsLauncherScript({ entryScript, claudeBin, sessionId, resumeId, mcpConfigPath, workdir }) {
  return [
    '@echo off',
    entryScript ? `call ${cmdq(entryScript)}` : null,
    workdir ? `cd /d ${cmdq(workdir)} || exit /b 1` : null,
    `call ${cmdq(claudeBin)} ${idArgs({ sessionId, resumeId }, cmdq)}${mcpConfigPath ? ` --mcp-config ${cmdq(mcpConfigPath)}` : ''}`,
    ''
  ]
    .filter((line) => line !== null)
    .join('\r\n')
}
