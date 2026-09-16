# Testing Session Deck on Windows

**Status: passed on 2026-09-16.** Keep this list for re-testing after changes to
the platform-specific parts (launching, hooks, process tracking, packaging).

It covers every assumption that can only be checked on Windows, roughly in the
order you hit them.

## 0. Build and install

- On the Mac: `npm run dist:win` → `dist/Session Deck Setup 0.1.0.exe`.
  Or on Windows: `npm install`, then `npm run dist:win`.
- The installer is unsigned: SmartScreen shows "Windows protected your PC" →
  *More info* → *Run anyway*.
- [ ] Installs, Start-menu shortcut says "Session Deck", icon is the plum tiles.
- [ ] App opens with a normal Windows frame; the menu bar appears on Alt.

## 1. Local sites

Assumption: Local keeps `sites.json` and `ssh-entry\<id>.bat` in `%APPDATA%\Local`.

- [ ] **+ New session → Local site** lists your sites with PHP versions.
- If the list is empty, find where Local actually keeps `sites.json` and report
  the path (`localDataDir` in `src/main/platform.js`).

## 2. Launching

Assumption: `call <site>.bat` then `claude` in one `cmd.exe` gives Claude the
site's PHP, MySQL and WP-CLI.

- [ ] Launching a site opens the focused terminal and Claude starts.
- [ ] In that session, ask Claude to run `wp --version` and `php -v` — both work,
      with the site's PHP version.
- [ ] **Directory** tab: a folder inside a site starts in that folder with WP-CLI;
      a folder outside any site starts there without it.
- [ ] Path with a space in it (e.g. `Local Sites`) works.
- If Claude does not start: check `%TEMP%\session-deck-launchers\launch-*.cmd`
  and whether `where claude` finds it from a normal `cmd`.

## 3. Hooks and tools

`npm run install-integration` defaults to the **Node hook script** on Windows.

- [ ] `npm run install-integration` (dry run) shows the node hook command and the
      MCP server, then `npm run install-integration -- --write` succeeds.
- [ ] `claude mcp list` shows `session-deck … ✔ Connected`.
- [ ] Tiles change status as Claude works (Working → Needs you → Done).
- [ ] Hook speed: does Claude feel slower per tool call? If so, try the curl
      form — it only works if hooks run under Git Bash:
      `npm run install-integration -- --write --hook-runner=curl`, then check
      tiles still update.
- [ ] Claude names the session and reports test pages without being asked
      (MCP instructions).

## 4. External sessions

- [ ] A Claude session started in Windows Terminal / PowerShell appears as an
      *external* tile with its name.
- [ ] **Go to Windows Terminal ↗** (or PhpStorm, VS Code) brings that window to
      the front. Windows may refuse to steal focus and flash the taskbar button
      instead — note which.

## 5. Background processes

Assumption: Claude on Windows runs Bash calls in Git Bash with the same
`shell-snapshots … eval '<command>'` wrapper as on macOS.

- [ ] Ask Claude to start something in the background (e.g. `npm run watch`).
      The tile shows **⟳ 1 running** within ~10s, marked *background*.
- [ ] **Stop** ends it (and its child node process).
- If nothing is listed: in PowerShell run
  `Get-CimInstance Win32_Process | ? { $_.CommandLine -like '*shell-snapshots*' } | select ProcessId,ParentProcessId,CommandLine`
  while it runs, and report the output — the wrapper probably differs.

## 6. The rest

- [ ] Resize the focused terminal; Claude's interface re-flows once, cleanly.
- [ ] A blocked session raises a Windows notification.
- [ ] Diff view finds the theme/plugin repos and shows staged/unstaged groups.
- [ ] `/rename` in Claude updates the tile name.
- [ ] Close and reopen the app: sessions come back as Interrupted and **Resume**
      works (transcripts in `%USERPROFILE%\.claude\projects`).
- [ ] **Worked on** shows today's hours.
