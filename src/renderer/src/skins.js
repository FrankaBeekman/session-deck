/**
 * Skin geometry. A skin changes shapes and frames, never colours: this file
 * says *where* lines and cuts go, in pixels for a given box, and skins.css says
 * what colour they are, from the theme's tokens. So every skin works with every
 * theme.
 *
 * Each shape returns:
 * - `clip`: the silhouette, as polygon points — the element is cut to it.
 * - `lines`: polylines drawn as the frame (closed ones repeat their start).
 * - `faint`: the same, drawn at lower emphasis.
 * - `dots`: small filled squares, [x, y, size].
 *
 * `kind` is 'tile', 'dialog' or 'window' (the focused session, which keeps a
 * square bottom-right corner: that is where its resize handle is).
 */

export const SKINS = [
  { key: 'plain', label: 'Plain', title: 'Rounded corners, no frames' },
  { key: 'cyberdeck', label: 'Cyberdeck', title: 'Stepped panels with a traced bezel, like hardware' },
  { key: 'hud', label: 'HUD', title: 'Bracketed frames and markers, like a ship’s display' }
]

const close = (pts) => [...pts, pts[0]]

/**
 * Cyberdeck: a panel whose top edge steps down part-way along and whose bottom
 * edge steps the other way, corners chamfered. `inset` gives the same outline
 * pulled inwards, for the traced line inside the bezel.
 */
function stepped(w, h, { step, cut, topAt, bottomAt, squareCorner = false }, inset = 0) {
  const i = inset
  const a = Math.round(w * topAt)
  const b = Math.round(w * bottomAt)
  const bottomRight = squareCorner ? [[w - i, h - i]] : [[w - i, h - cut - i], [w - cut - i, h - i]]
  return [
    [i, cut + i],
    [cut + i, i],
    [a - i, i],
    [a + step - i, step + i],
    [w - cut - i, step + i],
    [w - i, step + cut + i],
    ...bottomRight,
    [b + step + i, h - i],
    [b + i, h - step - i],
    [cut + i, h - step - i],
    [i, h - step - cut - i]
  ]
}

const CYBER = {
  tile: { step: 10, cut: 8, topAt: 0.58, bottomAt: 0.34 },
  dialog: { step: 14, cut: 12, topAt: 0.62, bottomAt: 0.3 },
  window: { step: 14, cut: 12, topAt: 0.62, bottomAt: 0.3, squareCorner: true }
}

function cyberdeck(kind, w, h) {
  const spec = CYBER[kind]
  return {
    clip: stepped(w, h, spec),
    // The stroke sits half a pixel in, so the clip does not shave it.
    lines: [close(stepped(w, h, spec, 0.75))],
    faint: [close(stepped(w, h, spec, kind === 'tile' ? 4.5 : 6))],
    dots: []
  }
}

/**
 * HUD: no outline, only pieces of one — corner brackets bent at 45°, a marker
 * square in each corner, a notched bar at the top centre and, on dialogs,
 * C-shaped side pieces and a row of ticks along the bottom.
 */
function hud(kind, w, h) {
  const big = kind !== 'tile'
  const i = 1
  const bend = big ? 12 : 8
  const armX = Math.min(w * (big ? 0.2 : 0.22), big ? 220 : 130)
  const armY = Math.min(h * 0.3, big ? 90 : 46)
  // Each arm runs along the edge, then steps inwards at 45° for its last part.
  const kink = big ? 6 : 4
  const corner = (sx, sy) => {
    const x = sx < 0 ? w - i : i
    const y = sy < 0 ? h - i : i
    const kx = armX * 0.62
    const ky = armY * 0.62
    return [
      [x + sx * kink, y + sy * armY],
      [x + sx * kink, y + sy * (ky + kink)],
      [x, y + sy * ky],
      [x, y + sy * bend],
      [x + sx * bend, y],
      [x + sx * kx, y],
      [x + sx * (kx + kink), y + sy * kink],
      [x + sx * armX, y + sy * kink]
    ]
  }
  const lines = [corner(1, 1), corner(-1, 1), corner(1, -1), corner(-1, -1)]

  // The notched bar at the top centre.
  const half = Math.min(w * (big ? 0.12 : 0.08), big ? 110 : 60)
  const cx = w / 2
  const drop = big ? 6 : 4
  lines.push([
    [cx - half, i],
    [cx - half + drop, i + drop],
    [cx + half - drop, i + drop],
    [cx + half, i]
  ])

  const faint = []
  if (big) {
    // C-shaped pieces halfway down each side, inside the dialog's padding:
    // any deeper and they cross labels and the terminal's first column.
    const my = h / 2
    const reach = Math.min(h * 0.14, 70)
    for (const [x, dir] of [[i, 1], [w - i, -1]]) {
      lines.push([[x, my - reach - 10], [x + dir * 8, my - reach], [x + dir * 8, my + reach], [x, my + reach + 10]])
    }
    // Ticks along the bottom centre.
    for (let t = -4; t <= 4; t++) {
      const x = cx + t * 12
      faint.push([[x, h - i], [x, h - i - (t % 2 === 0 ? 7 : 4)]])
    }
  }

  const s = big ? 5 : 4
  const dots = [
    [0, 0, s],
    [w - s, 0, s],
    [0, h - s, s],
    [w - s, h - s, s]
  ]
  return { clip: null, lines, faint, dots }
}

export function skinShape(skin, kind, w, h) {
  if (!w || !h) return null
  if (skin === 'cyberdeck') return cyberdeck(kind, w, h)
  if (skin === 'hud') return hud(kind, w, h)
  return null
}

export const toPolygon = (pts) => `polygon(${pts.map(([x, y]) => `${x}px ${y}px`).join(', ')})`
export const toPoints = (pts) => pts.map(([x, y]) => `${x},${y}`).join(' ')
