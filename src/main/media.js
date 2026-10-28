import { app, nativeImage, net } from 'electron'
import { EventEmitter } from 'events'
import { execFile } from 'child_process'
import { readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { IS_MAC } from './platform.js'
import { ensurePrivateDir } from './private-dir.mjs'
import {
  SOURCES_MAC,
  commandScript,
  parsePgrep,
  parseState,
  pickActive,
  isArtworkUrl,
  imageType,
  isDenied,
  bundleOf
} from './media-core.js'

const FAST = 3000 // while a player is running
const SLOW = 10000 // only checking whether one has started
const MAX_ARTWORK = 2 * 1024 * 1024

// osascript waits for as long as the Automation prompt is open, so this is
// generous; a tick never overlaps the previous one anyway.
const run = (args, timeout = 60000) =>
  new Promise((resolve) => {
    execFile('osascript', args, { timeout }, (err, stdout, stderr) => resolve({ err, stdout, stderr }))
  })

const runningPlayers = () =>
  new Promise((resolve) => {
    const pattern = SOURCES_MAC.map((s) => s.process).join('|')
    // pgrep exits 1 when nothing matches; that is an answer, not a failure.
    execFile('pgrep', ['-x', '-l', pattern], (_err, stdout) => resolve(parsePgrep(stdout)))
  })

const executableOf = (pid) =>
  new Promise((resolve) => {
    execFile('ps', ['-o', 'comm=', '-p', String(pid)], (_err, stdout) => resolve(stdout ?? ''))
  })

/**
 * The title bar's now playing widget: Spotify and Apple Music, through
 * AppleScript. Opt-in, and while it is off nothing runs at all — no pgrep, no
 * osascript, so no Automation prompt either.
 *
 * One state object, broadcast whole on every change, as in updater.js.
 */
class Media extends EventEmitter {
  constructor() {
    super()
    this.enabled = false
    this.visible = true
    this.timer = null
    this.busy = false
    // Per source: { id, track, playing, changedAt, denied }
    this.players = new Map(SOURCES_MAC.map((s) => [s.id, { id: s.id, track: null, playing: false, changedAt: 0, denied: false }]))
    this.artwork = { key: null, url: null }
    // Per source id: the app's icon as a data URL, taken from the running bundle.
    this.icons = new Map()
    this.pids = new Map()
    this.state = { status: 'off', source: null, playing: false, track: null, artwork: null, denied: [] }
  }

  setEnabled(on) {
    this.enabled = Boolean(on) && IS_MAC
    this.reschedule(0)
    if (!this.enabled) this.publish()
  }

  /** Hidden or minimized: nobody sees the widget, so stop asking. */
  setVisible(on) {
    this.visible = Boolean(on)
    this.reschedule(0)
  }

  /** After a denial, polling that player stops until the user asks again. */
  retry() {
    for (const p of this.players.values()) p.denied = false
    this.reschedule(0)
  }

  async command(verb) {
    const source = SOURCES_MAC.find((s) => s.id === this.state.source?.id)
    const script = source && commandScript(source, verb)
    if (!this.enabled || !script) return
    await run(['-e', script], 10000)
    // Players report the new state a moment late; look now and once more.
    this.reschedule(0)
    setTimeout(() => this.reschedule(0), 400)
  }

  reschedule(delay) {
    clearTimeout(this.timer)
    this.timer = null
    if (this.enabled && this.visible) this.timer = setTimeout(() => this.tick(), delay)
  }

  async tick() {
    if (this.busy) return
    this.busy = true
    let anyRunning = false
    try {
      const running = await runningPlayers()
      this.pids = running
      for (const source of SOURCES_MAC) {
        const player = this.players.get(source.id)
        if (!running.has(source.process)) {
          this.update(player, { track: null, playing: false })
          continue
        }
        anyRunning = true
        if (player.denied) {
          this.update(player, { track: null, playing: false })
          continue
        }
        const { err, stdout, stderr } = await run(['-e', source.state])
        if (err) {
          if (isDenied(stderr)) {
            player.denied = true
            this.update(player, { track: null, playing: false })
          } else console.error(`[media] ${source.id}: ${String(stderr || err.message).trim()}`)
          continue
        }
        this.update(player, parseState(stdout))
      }
      await this.publish()
    } finally {
      this.busy = false
      if (this.enabled) this.reschedule(anyRunning ? FAST : SLOW)
    }
  }

  update(player, { track, playing }) {
    if ((track?.id ?? null) !== (player.track?.id ?? null) || playing !== player.playing) player.changedAt = Date.now()
    player.track = track
    player.playing = playing
  }

  async publish() {
    const players = [...this.players.values()]
    const active = this.enabled ? pickActive(players) : null
    const source = active && SOURCES_MAC.find((s) => s.id === active.id)
    const denied = this.enabled ? SOURCES_MAC.filter((s) => this.players.get(s.id).denied).map((s) => ({ id: s.id, label: s.label })) : []
    const artwork = active ? await this.artworkFor(source, active.track) : null
    const icon = source ? await this.iconFor(source) : null
    const status = !this.enabled ? 'off' : active ? 'ok' : denied.length ? 'denied' : 'idle'
    const next = {
      status,
      source: source ? { id: source.id, label: source.label, icon } : null,
      playing: Boolean(active?.playing),
      track: active ? { name: active.track.name, artist: active.track.artist, album: active.track.album } : null,
      artwork,
      denied
    }
    if (JSON.stringify(next) === JSON.stringify(this.state)) return
    this.state = next
    this.emit('change', this.state)
  }

  /**
   * The player's own icon, from the bundle the running process was started
   * from — so it is right wherever the app is installed. Kept once found; a
   * miss is retried on the next poll, and the widget shows the name meanwhile.
   *
   * A Quick Look thumbnail, not app.getFileIcon: on macOS that one goes by the
   * `.app` extension alone and returns the generic application icon.
   */
  async iconFor(source) {
    if (this.icons.has(source.id)) return this.icons.get(source.id)
    const pid = this.pids.get(source.process)
    const bundle = pid && bundleOf(await executableOf(pid))
    if (!bundle) return null
    try {
      const image = await nativeImage.createThumbnailFromPath(bundle, { width: 64, height: 64 })
      if (image.isEmpty()) return null
      const url = image.toDataURL()
      this.icons.set(source.id, url)
      return url
    } catch (err) {
      console.error(`[media] icon: ${err.message}`)
      return null
    }
  }

  /** One cover cached: the current track's. Fetched once per track, never by the renderer. */
  async artworkFor(source, track) {
    const key = `${source.id}:${track.id}`
    if (this.artwork.key === key) return this.artwork.url
    let url = null
    try {
      const bytes = source.artwork ? await this.musicArtwork(source) : await this.remoteArtwork(track.artworkUrl)
      const type = bytes && bytes.length <= MAX_ARTWORK ? imageType(bytes) : null
      if (type) url = `data:${type};base64,${bytes.toString('base64')}`
    } catch (err) {
      console.error(`[media] artwork: ${err.message}`)
    }
    this.artwork = { key, url }
    return url
  }

  async remoteArtwork(url) {
    if (!isArtworkUrl(url)) return null
    const res = await net.fetch(url, { redirect: 'error' })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  }

  /** Music hands over raw bytes only, so they go through a private temp file. */
  async musicArtwork(source) {
    const file = join(ensurePrivateDir(join(app.getPath('temp'), 'session-deck-media')), 'cover')
    try {
      const { err, stdout } = await run(['-e', source.artwork, file], 10000)
      if (err || stdout.trim() !== 'ok') return null
      return readFileSync(file)
    } finally {
      rmSync(file, { force: true })
    }
  }
}

export const media = new Media()
