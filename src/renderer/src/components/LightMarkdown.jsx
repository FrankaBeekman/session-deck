/** `code` spans kept, **bold** and [links](…) reduced to their text. */
function inline(text) {
  const clean = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1')
  return clean.split(/(`[^`]+`)/g).map((part, i) =>
    part.startsWith('`') && part.endsWith('`') && part.length > 1 ? <code key={i}>{part.slice(1, -1)}</code> : part
  )
}

/**
 * Just enough Markdown for release notes and summaries — headings, bullets,
 * paragraphs, inline code — without pulling in a parser. Anything else shows
 * as the text it is.
 */
export default function LightMarkdown({ text, className = '' }) {
  const blocks = []
  for (const raw of String(text ?? '').trim().split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const bullet = line.match(/^[-*]\s+(.*)$/)
    if (bullet) {
      const last = blocks.at(-1)
      if (last?.type === 'list') last.items.push(bullet[1])
      else blocks.push({ type: 'list', items: [bullet[1]] })
    } else if (/^#{1,6}\s/.test(line)) {
      blocks.push({ type: 'head', text: line.replace(/^#+\s*/, '') })
    } else {
      blocks.push({ type: 'p', text: line })
    }
  }

  return (
    <div className={`lightmd ${className}`}>
      {blocks.map((b, i) =>
        b.type === 'head' ? (
          <h4 key={i}>{inline(b.text)}</h4>
        ) : b.type === 'list' ? (
          <ul key={i}>
            {b.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{inline(b.text)}</p>
        )
      )}
    </div>
  )
}
