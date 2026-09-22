/**
 * 生成 Tauri 需要的最小图标集（纯 Node 实现，不依赖图像库）
 * 设计：iOS 风格圆角方块 + 渐变蓝底 + 白色日历
 *
 *   node scripts/gen-icons.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(__dirname, '../src-tauri/icons')
mkdirSync(outDir, { recursive: true })

const SIZE = 512

/** 圆角矩形内部判定 */
function insideRoundedRect(x, y, w, h, r) {
  const cx = Math.min(Math.max(x, r), w - r)
  const cy = Math.min(Math.max(y, r), h - r)
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= r * r
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function mix(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)]
}

/** 抗锯齿：4x4 超采样 */
function renderIcon(size) {
  const SS = 4
  const px = new Uint8Array(size * size * 4)
  const bg1 = [94, 178, 255] // #5EB2FF 顶部
  const bg2 = [10, 118, 244] // #0A76F4 底部
  const deep = [7, 82, 176] // 日历标题条深蓝
  const white = [255, 255, 255]
  const S = size

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let rSum = 0
      let gSum = 0
      let bSum = 0
      let aSum = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS
          const fy = y + (sy + 0.5) / SS

          // ---- 圆角方块底 ----
          const pad = S * 0.04
          if (!insideRoundedRect(fx - pad, fy - pad, S - pad * 2, S - pad * 2, S * 0.23)) continue

          const t = Math.min(1, Math.max(0, (fx / S) * 0.35 + (fy / S) * 0.65))
          let col = mix(bg1, bg2, t)
          // 顶部玻璃高光
          const gloss = Math.max(0, 1 - fy / (S * 0.55)) ** 1.6 * 0.32
          col = [col[0] + (255 - col[0]) * gloss, col[1] + (255 - col[1]) * gloss, col[2] + (255 - col[2]) * gloss]

          // ---- 白色日历本体 ----
          const calW = S * 0.6
          const calH = S * 0.54
          const calX = (S - calW) / 2
          const calY = (S - calH) / 2 + S * 0.035
          const calR = S * 0.1
          const dInCal = insideRoundedRect(fx - calX, fy - calY, calW, calH, calR)

          // 顶部两个挂环（在日历外面，画在蓝色底上）
          const ringW = S * 0.055
          const ringH = S * 0.085
          const ringY = calY - ringH * 0.62
          for (const rx of [calX + calW * 0.26, calX + calW * 0.74]) {
            if (insideRoundedRect(fx - (rx - ringW / 2), fy - ringY, ringW, ringH, ringW / 2)) {
              col = mix(col, white, 0.92)
            }
          }

          if (dInCal) {
            const rel = (fy - calY) / calH
            if (rel < 0.27) {
              // 标题条：深蓝
              col = mix(deep, [30, 140, 255], 0.25 * (fx - calX) / calW)
            } else {
              col = white
              // 3 列 × 2 行的小圆点
              const gx = ((fx - calX) / calW - 0.12) / 0.76
              const gy = (rel - 0.27) / 0.73
              if (gx >= 0 && gx < 1 && gy >= 0) {
                const cols = 3
                const rows = 2
                const cw = 1 / cols
                const ch = 1 / rows
                const ci = Math.floor(gx / cw)
                const cj = Math.floor(gy / ch)
                const inX = (gx - ci * cw) / cw
                const inY = (gy - cj * ch) / ch
                const r = 0.17
                if ((inX - 0.5) ** 2 + (inY - 0.5) ** 2 < r * r) {
                  const dot = cj === 0 && ci === 1 ? [255, 59, 48] : deep
                  col = mix(col, dot, 0.92)
                }
              }
            }
          }

          rSum += col[0]
          gSum += col[1]
          bSum += col[2]
          aSum += 255
        }
      }
      const n = SS * SS
      const i = (y * S + x) * 4
      const a = aSum / n
      const cover = a / 255
      px[i] = cover > 0 ? Math.round(rSum / (n * cover)) : 0
      px[i + 1] = cover > 0 ? Math.round(gSum / (n * cover)) : 0
      px[i + 2] = cover > 0 ? Math.round(bSum / (n * cover)) : 0
      px[i + 3] = Math.round(a)
    }
  }
  return px
}

/* ---------------- PNG 编码 ---------------- */

function crc32(buf) {
  let c
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[n] = c
    }
    return t
  })())
  let crc = -1
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff]
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function encodePng(px, size) {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter: none
    Buffer.from(px.buffer, px.byteOffset + y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ---------------- ICO 编码（内嵌 PNG） ---------------- */

function encodeIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)
  const entries = []
  let offset = 6 + images.length * 16
  for (const img of images) {
    const e = Buffer.alloc(16)
    e[0] = img.size >= 256 ? 0 : img.size
    e[1] = img.size >= 256 ? 0 : img.size
    e[2] = 0
    e[3] = 0
    e.writeUInt16LE(1, 4) // color planes
    e.writeUInt16LE(32, 6) // bpp
    e.writeUInt32LE(img.png.length, 8)
    e.writeUInt32LE(offset, 12)
    entries.push(e)
    offset += img.png.length
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)])
}

/* ---------------- 输出 ---------------- */

const master = renderIcon(SIZE)
writeFileSync(resolve(outDir, 'icon.png'), encodePng(master, SIZE))
writeFileSync(resolve(outDir, '128x128.png'), encodePng(renderIcon(128), 128))
writeFileSync(resolve(outDir, '32x32.png'), encodePng(renderIcon(32), 32))
writeFileSync(resolve(outDir, '128x128@2x.png'), encodePng(renderIcon(256), 256))

// Windows Store 用的方块 logo（可选，但一起生成更省事）
for (const [name, size] of [
  ['Square30x30Logo.png', 30],
  ['Square44x44Logo.png', 44],
  ['Square71x71Logo.png', 71],
  ['Square89x89Logo.png', 89],
  ['Square107x107Logo.png', 107],
  ['Square142x142Logo.png', 142],
  ['Square150x150Logo.png', 150],
  ['Square284x284Logo.png', 284],
  ['Square310x310Logo.png', 310],
  ['StoreLogo.png', 50],
]) {
  writeFileSync(resolve(outDir, name), encodePng(renderIcon(size), size))
}

const ico = encodeIco(
  [16, 24, 32, 48, 64, 128, 256].map((s) => ({ size: s, png: encodePng(renderIcon(s), s) })),
)
writeFileSync(resolve(outDir, 'icon.ico'), ico)

console.log('icons written to', outDir)
