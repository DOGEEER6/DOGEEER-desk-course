/**
 * 把散落的硬编码中性色迁移到设计令牌（surface-1/2/3、glass、field…），
 * 这样暗色主题才能整体生效。
 *
 *   node scripts/tokenize.mjs --dry
 *   node scripts/tokenize.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { readdirSync, statSync } from 'node:fs'
import { join, resolve, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dry = process.argv.includes('--dry')

const RULES = [
  // 浅色中性填充 → 语义令牌
  [/bg-slate-900\/\[0\.02\]/g, 'bg-surface-1'],
  [/bg-slate-900\/\[0\.022\]/g, 'bg-surface-1'],
  [/bg-slate-900\/\[0\.025\]/g, 'bg-surface-1'],
  [/bg-slate-900\/\[0\.03\]/g, 'bg-surface-1'],
  [/bg-slate-900\/\[0\.035\]/g, 'bg-surface-1'],
  [/bg-slate-900\/\[0\.04\]/g, 'bg-surface-1'],
  [/bg-slate-900\/\[0\.045\]/g, 'bg-surface-1'],
  [/bg-slate-900\/\[0\.05\]/g, 'bg-surface-2'],
  [/bg-slate-900\/\[0\.07\]/g, 'bg-surface-2'],
  [/bg-slate-900\/\[0\.08\]/g, 'bg-surface-2'],
  [/bg-slate-900\/\[0\.09\]/g, 'bg-surface-2'],
  [/bg-slate-900\/\[0\.1\]/g, 'bg-surface-3'],
  [/bg-slate-900\/5/g, 'bg-surface-2'],
  [/bg-slate-900\/8/g, 'bg-surface-2'],
  [/bg-slate-900\/12/g, 'bg-surface-3'],
  [/bg-slate-100/g, 'bg-surface-2'],
  [/bg-slate-50/g, 'bg-surface-2'],

  // 面板背景 → 玻璃
  [/bg-white\/95/g, 'bg-glass'],
  [/bg-white\/80/g, 'bg-glass-thin'],
  [/bg-white\/78/g, 'bg-glass'],
  [/bg-white\/70/g, 'bg-glass-thin'],
  [/bg-white\/60/g, 'bg-glass-thin'],
  [/bg-white\/55/g, 'bg-glass-thin'],
  [/bg-white\b(?![/\w-])/g, 'bg-glass-thin'],

  // 边框
  [/border-white\/70/g, 'border-glass-line'],
  [/border-slate-900\/12/g, 'border-line-strong'],
  [/ring-slate-400/g, 'ring-ink-4'],

  // 中性文字上的浮层底（深色遮罩保持原样，这里只处理浅色 chip）
  [/bg-black\/10/g, 'bg-surface-3'],

  // 阴影统一
  [/shadow-\[0_2px_10px_-4px_rgba\(15,23,42,0\.28\)\]/g, 'shadow-[var(--sh-soft)]'],
]

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) out.push(...walk(p))
    else if (['.tsx', '.ts'].includes(extname(p))) out.push(p)
  }
  return out
}

let totalFiles = 0
let totalHits = 0
for (const file of walk(join(root, 'src'))) {
  const before = readFileSync(file, 'utf8')
  let after = before
  const hits = []
  for (const [re, to] of RULES) {
    const m = after.match(re)
    if (m) {
      hits.push(`${m.length}× ${re.source} → ${to}`)
      after = after.replace(re, to)
    }
  }
  if (after !== before) {
    totalFiles += 1
    totalHits += hits.length
    console.log(`\n${file.replace(root + '\\', '')}`)
    for (const h of hits) console.log(`   ${h}`)
    if (!dry) writeFileSync(file, after)
  }
}

console.log(`\n${dry ? '[dry-run] ' : ''}改动文件 ${totalFiles} 个，规则命中 ${totalHits} 处`)
