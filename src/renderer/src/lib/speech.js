/**
 * A reply written to be read, turned into something to listen to — and to read
 * along with, so what is shown is exactly what is spoken. Pure: no DOM, no
 * speech engine.
 *
 * Code blocks are shown but not read. Tables are read row by row. Inline code
 * that is a path is read as its file name, links as their text, long hashes
 * shortened; Markdown markers go.
 */

const PATH = /^[~.]?[\w@.-]*[/\\][\w@./\\-]*(:\d+(-\d+)?)?$/
const FILE = /^[\w@-]+\.[a-z0-9]{1,5}(:\d+(-\d+)?)?$/i

/** `src/main/composer.js:42` → `composer.js`; anything else as it is. */
function spokenCode(code) {
  const c = code.trim()
  if (PATH.test(c) || FILE.test(c)) {
    const name = c.replace(/:\d+(-\d+)?$/, '').split(/[/\\]/).filter(Boolean).pop()
    return name ?? c
  }
  return c
}

/** One line of Markdown, as it should sound. */
export function spokenInline(text) {
  return (
    String(text ?? '')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/<?\bhttps?:\/\/([^/\s>)]+)[^\s>)]*>?/g, (_m, host) => `a link to ${host.replace(/^www\./, '')}`)
      .replace(/`([^`]+)`/g, (_m, code) => spokenCode(code))
      .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, '$2')
      .replace(/(^|[\s(])[*_](?=\S)(.+?)(?<=\S)[*_](?=[\s).,;:!?]|$)/g, '$1$2')
      .replace(/~~(.+?)~~/g, '$1')
      .replace(/\b([0-9a-f]{7})[0-9a-f]{5,33}\b/gi, (m, short) => (/\d/.test(m) && /[a-f]/i.test(m) ? short : m))
      .replace(/\s*(→|->|=>|⇒)\s*/g, ' to ')
      .replace(/\s*(←|<-)\s*/g, ' from ')
      .replace(/\s+·\s+/g, ', ')
      .replace(/[✓✔✗✘☐☑◑●○•▶⏸↗↻⟳…]+/g, (m) => (m.includes('…') ? '…' : ''))
      .replace(/\s{2,}/g, ' ')
      .trim()
  )
}

/** Sentences, on a stop followed by a capital or a digit. */
export function sentences(text) {
  return String(text ?? '')
    .split(/(?<=[.!?…:;])\s+(?=["“'‘(\[]?[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Markdown → blocks to show, each with its sentences:
 *   [{ kind: 'head' | 'p' | 'item' | 'code', sentences: [{ id, text }], code? }]
 * Sentence ids run through the whole reply, in reading order.
 */
export function speechBlocks(markdown) {
  const blocks = []
  let id = 0
  let para = null
  const push = (kind, text) => {
    const spoken = sentences(spokenInline(text)).map((t) => ({ id: id++, text: t }))
    if (spoken.length) blocks.push({ kind, sentences: spoken })
  }
  const flush = () => {
    if (para) push('p', para.join(' '))
    para = null
  }

  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const fence = line.match(/^(```|~~~)/)
    if (fence) {
      flush()
      const code = []
      while (++i < lines.length && !lines[i].trim().startsWith(fence[1])) code.push(lines[i])
      blocks.push({ kind: 'code', sentences: [], code: code.join('\n') })
      continue
    }
    if (!line) {
      flush()
      continue
    }
    if (/^\|.*\|$/.test(line)) {
      flush()
      if (/^\|[\s:|-]+\|$/.test(line)) continue // the header's underline
      push('item', line.slice(1, -1).split('|').map((c) => c.trim()).filter(Boolean).join(', '))
      continue
    }
    const head = line.match(/^#{1,6}\s+(.*)$/)
    if (head) {
      flush()
      push('head', head[1])
      continue
    }
    const item = line.match(/^(?:[-*+]|\d+[.)])\s+(.*)$/)
    if (item) {
      flush()
      push('item', item[1])
      continue
    }
    if (/^(---|\*\*\*|___)$/.test(line)) {
      flush()
      continue
    }
    // A continuation of the list item above, or of the paragraph.
    const text = line.replace(/^>\s?/, '')
    if (!para && blocks.at(-1)?.kind === 'item' && /^\s{2,}/.test(lines[i])) {
      const last = blocks.pop()
      id -= last.sentences.length
      push('item', `${last.sentences.map((s) => s.text).join(' ')} ${text}`)
      continue
    }
    para = [...(para ?? []), text]
  }
  flush()
  return blocks
}

export const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2]
