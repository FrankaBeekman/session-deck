# Session Deck

A macOS dashboard for Claude Code sessions running across LocalWP sites.
Its job is one thing: make a session that is *blocked on you* announce itself.

## Setup

```sh
npm install                      # postinstall rebuilds node-pty for Electron
npm run install-hooks            # dry run — shows what it would add
npm run install-hooks -- --write # actually merge into ~/.claude/settings.json
npm run dev
```

The hook installer backs up `~/.claude/settings.json` before touching it, and
skips any event that already has a Session Deck hook.

## Building a real app

```sh
npm run dist    # -> dist/Session Deck-<version>-arm64.dmg  + dist/mac-arm64/Session Deck.app
npm run pack    # unpacked .app only, faster
```

Then drag it to `/Applications` and it is Spotlight-launchable. The build is
**unsigned** (`identity: null`) -- fine for personal use, but a copy that has
been through a download or AirDrop will carry a quarantine flag. Clear it with:

```sh
xattr -dr com.apple.quarantine "/Applications/Session Deck.app"
```

The icon is generated, not hand-drawn: `build/icon.html` is rendered by
`build/render-icon.cjs` (using the Electron already installed) into
`build/icon-1024.png`, then `sips` + `iconutil` produce `build/icon.icns`.
Edit the HTML and re-run those two steps to change it.

**Window lifecycle (macOS).** Closing the window with the red button does *not*
end your sessions -- the app stays in the dock with everything running, and
reopening it shows the same deck. Sessions are torn down on `before-quit` only,
because watching long-running work is the point of the app. On Windows/Linux,
closing the last window quits.

Dev and the packaged app share hook port 47823, so only one can own status at a
time. The second one to start warns and keeps working rather than dying.

## How it works

Three channels, none of which require patching Claude Code:

| Direction | Channel | Carries |
|---|---|---|
| out | Local site shell | Spawns the PTY with PHP/MySQL/WP-CLI on `PATH` |
| in | Hooks | Lifecycle events → tile status |
| in | MCP | Session names and test-page URLs |

**Launching.** Local's `ssh-entry/<siteID>.sh` ends with `exec $SHELL`. We spawn
that script with `SHELL` pointed at a one-shot launcher that execs
`claude --session-id <uuid>`. The UUID is minted before spawning, so every hook
event correlates to a tile with no guessing. See `src/main/launcher.js`.

**Tile state comes from hooks, not the terminal.** Claude Code redraws its TUI
with cursor movement, so the raw PTY stream has no stable "last four lines".
Hook payloads carry the structured facts the tile needs — tool name, target
file, permission question — so tiles are rendered from those. The PTY buffer
exists only to replay into xterm.js when a session is focused.
See `src/main/registry.js`.

**One emulator, ever.** Tiles are plain text. A real `xterm.js` instance mounts
only in the focused view, at the PTY's pinned 120×32, and is disposed on close.

## The MCP server

`src/main/mcp-bridge.mjs` is a dependency-free stdio JSON-RPC server exposing two
tools:

- `set_session_name(name)` -- names the tile
- `report_test_page(url, title?)` -- adds the clickable link under the terminal

It is wired **per session** via `claude --mcp-config <tmpfile>`, written at launch
alongside the shell launcher. Nothing global is registered, and the server exists
only for sessions the deck itself started.

Identity travels by environment: the deck exports `SESSION_DECK_ID` into the
session, and Claude Code passes its environment down to MCP subprocesses, so the
bridge knows which tile it belongs to without being told.

The bridge has no dependencies on purpose -- it is executed by Claude Code from
`Contents/Resources`, where the app's `node_modules` is not reachable. It ships
as an `extraResources` entry so it lands outside `app.asar`.

**Session names.** `set_session_name` is the good name, but Claude has to choose
to call it. So `UserPromptSubmit` also derives a fallback name from the first
prompt -- a tile never reads "Untitled session". An MCP-set name always wins.

## Sessions started outside the deck

Hooks are installed globally, so sessions started in a terminal or an IDE send
events too. The deck **adopts** them as read-only tiles: full status, named from
the first user message in their transcript, but no terminal and no launch --
there is no PTY to attach to. They carry an `external` badge, and "Remove from
deck" drops the tile without touching the session.

Without this the deck silently under-reported what was running on the machine,
which is worse than showing less: a dashboard that omits half your sessions is
one you stop trusting.

## Notification types are not all urgent

`Notification` fires for `notification_type: "idle_prompt"` -- Claude finished
and awaits your next instruction -- as well as for genuine permission requests.
Mapping all of them to "Needs you" made the deck raise its one urgent signal for
sessions that wanted nothing. `idle_prompt` now maps to **Done**; everything else
raises the alert, and the alert only says "Permission requested" when the
payload's type actually indicates one.

## Test pages

The deck does **not** create pages. `report_test_page(url, title?)` records a URL
Claude gives it — Claude creates the page however that site needs (usually
WP-CLI). Deck-side WP-CLI was considered and rejected: the sites differ too much
in setup for one code path to hold.

Records are keyed by **project**, so they accumulate across sessions, and they
live in `~/.session-deck/store.json` so they survive a restart. A tile links the
most recent and offers "all N" for the full list.

Storage is a JSON file with atomic temp+rename writes, deliberately not SQLite:
the payload is a few hundred links, and a native module would add exactly the
rebuild and architecture failure modes that already cost a day on node-pty.

"Forget" removes the deck's record only. The WordPress page is never touched —
the deck has no post ID and no WP access, and it should stay that way.

## Resume after a restart

Sessions are children of the app, so quitting kills them — but the *conversation*
survives on disk, and `claude --resume <uuid>` reopens it **under the original
session id** (forking is opt-in via `--fork-session`). So a resumed session's
hooks keep matching its existing tile: it recovers its identity, not just its
history.

The deck records every session it launches in `store.json`. On startup those
records become dashed **Interrupted** tiles with a Resume action. Records are
dropped when:

- `SessionEnd` fired — the session was ended deliberately, not interrupted
- its Local site no longer exists
- it has not been seen for 7 days

So the deck offers to resume only what it actually lost.

## Diff view

A LocalWP site is **not one repository**, and this is the thing that shapes the
whole feature. On a typical agency WordPress project:

- the site-level repo (`<site>/app`) gitignores `public/` entirely, so it can
  never show a change to any WordPress code
- the actual work lives in ten or more independent repos under `wp-content` --
  the theme, each custom plugin, plus vendored third-party ones

So the panel does not resolve "the" repo. It finds repos two ways:

1. **From the files the session edited.** `PreToolUse` gives us every
   `file_path`, so the repo containing each one is resolved directly. Precise,
   and free.
2. **A shallow scan** of `wp-content/{themes,plugins,mu-plugins}` as a fallback,
   for changes made outside the session (a build step, a colleague's branch).

Repos with no changes *and* no edits are dropped, so the panel does not list ten
clean vendored plugins. Edited repos sort first and are badged.

Left pane: repos and their changed files. Right pane: unified diff, coloured by
line role. Untracked files diff against `/dev/null` so a new file shows as fully
added. Diffs are capped at 400KB and marked when truncated.

## Closing vs removing

Two different operations, which an earlier version conflated:

- **End session** kills the PTY. The tile stays, showing *Closed*, so you can see
  what happened.
- **Remove from deck** drops the tile. It kills the PTY first if one is still
  running, and marks the durable record ended so the session does not come back
  as *Interrupted* after a restart.

Any tile with nothing running behind it — closed, adopted, or interrupted —
carries a dismiss (×) in its corner. Live sessions do not: removing one kills it,
and that should stay a deliberate act from inside the session view.

## Diagnostics

```sh
npm run status                    # token-gated GET /sessions
cat ~/.session-deck/hooks.jsonl   # every raw hook payload received
cat ~/.session-deck/store.json    # durable state (test pages)
```

## Layout

```
src/main/       local.js      read Local's sites.json (read-only)
                launcher.js   the SHELL-override spawn
                hooks.js      localhost hook receiver (127.0.0.1:47823, token-gated)
                registry.js   session state, hook → status mapping
                index.js      window, IPC, notifications
src/preload/    contextBridge surface — no node in the renderer
src/renderer/   React: App, SessionTile, FocusedSession, ProjectPicker
```

## Status

v1 slice: project picker, launch, hook-driven tiles, focused terminal,
answer permission prompts from the tile.

v1.5: MCP server (session names, test pages) -- built.

**Answering from the deck is deliberately not a feature.** An early version put
Allow/Deny on the tile by writing menu numbers into the PTY; the menu varies per
tool, and "Deny" selected "yes, and don't ask again" -- a deny button that
granted standing permission. The deck's job is to tell you *which* session needs
you. Answering happens in that session's own prompt, where the options are
unambiguous and nothing has to be inferred. Do not reintroduce it.

Everything in the original spec is built. Possible next: side-by-side diff
(currently unified), committing from the panel, notification tuning.

## Known environment notes

**Check that Node matches your CPU architecture.** On Apple Silicon it is easy
to end up with an x64 Node running under Rosetta:

```sh
node -p process.arch   # x64 …
uname -m               # …while the machine says arm64
```

When they disagree, anything Node builds or launches is translated too. It
works, but a daily-driver desktop app will be slower and use more battery than
it needs to. Fixing it means reinstalling Node for arm64, which affects every
other project on the machine — so it is worth deciding deliberately rather than
discovering later.

**If `npm run dev` says `Error: Electron uninstall`,** Electron's binary
download was skipped (this happens on in-place version upgrades). Recover with:

```sh
node node_modules/electron/install.js
```

**Local writes unexpanded `~` into some `sites.json` paths.** Some sites store
`~/Local Sites/<name>` literally. That is not a real path, so using
it as a spawn `cwd` fails with `posix_spawnp failed`. `local.js` expands it, and
`launcher.js` falls back to `$HOME` if a path still does not resolve -- the
ssh-entry script cd's into the site itself, so `cwd` only has to be valid.

**`posix_spawnp failed` on every launch.** npm extraction drops the execute bit
from node-pty's `prebuilds/*/spawn-helper`. node-pty spawns that helper via
`posix_spawnp`, so without `+x` every session dies with that message -- which
names neither the file nor the reason. `npm run fix-pty` (also wired to
`postinstall`) restores it.

**No `electron-rebuild`.** node-pty 1.x ships NAPI prebuilds that work across
Electron versions, so rebuilding is unnecessary. It can also be actively
harmful: if Node and Electron differ in architecture (see above), `electron-rebuild`
builds for Node's, producing a `build/Release` that shadows the correct prebuild.
The dependency has been removed and `postinstall` runs `fix-node-pty.mjs` instead.

**Dev-only advisories.** `npm audit` reports findings in the build chain
(`vite`, and `tar` via `@electron/rebuild`). These are build-time dependencies
that do not ship in the packaged app. Electron itself is kept current — v32 was
past end-of-life and has been upgraded to v44.
