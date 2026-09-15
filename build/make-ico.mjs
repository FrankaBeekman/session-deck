/**
 * Pack PNGs into a Windows .ico. Windows Vista and later accept PNG-compressed
 * entries, so no image library is needed: a 6-byte header, a 16-byte directory
 * entry per image, then the PNG bytes.
 *   node build/make-ico.mjs out.ico 16.png 32.png … 256.png
 */
import { readFileSync, writeFileSync } from 'fs'

const [out, ...pngs] = process.argv.slice(2)
const images = pngs.map((file) => {
  const data = readFileSync(file)
  // PNG IHDR: width and height are big-endian at bytes 16 and 20.
  return { data, width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
})

const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // type: icon
header.writeUInt16LE(images.length, 4)

let offset = 6 + 16 * images.length
const entries = images.map(({ data, width, height }) => {
  const e = Buffer.alloc(16)
  e.writeUInt8(width >= 256 ? 0 : width, 0) // 0 means 256
  e.writeUInt8(height >= 256 ? 0 : height, 1)
  e.writeUInt8(0, 2) // no palette
  e.writeUInt8(0, 3)
  e.writeUInt16LE(1, 4) // colour planes
  e.writeUInt16LE(32, 6) // bits per pixel
  e.writeUInt32LE(data.length, 8)
  e.writeUInt32LE(offset, 12)
  offset += data.length
  return e
})

writeFileSync(out, Buffer.concat([header, ...entries, ...images.map((i) => i.data)]))
console.log(`wrote ${out}: ${images.map((i) => i.width).join(', ')}px`)
