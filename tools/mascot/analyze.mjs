// Find anatomical landmarks in the generated mesh by scanning Y slices.
import { NodeIO } from '@gltf-transform/core'
import { EXTTextureWebP } from '@gltf-transform/extensions'

const io = new NodeIO().registerExtensions([EXTTextureWebP])
const doc = await io.read(process.argv[2] || 'charaf_body.glb')
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0]
const pos = prim.getAttribute('POSITION').getArray()
const n = pos.length / 3

let minY = Infinity
let maxY = -Infinity
for (let i = 0; i < n; i++) {
  const y = pos[i * 3 + 1]
  if (y < minY) minY = y
  if (y > maxY) maxY = y
}
const H = maxY - minY
console.log(`verts=${n}  Y: ${minY.toFixed(4)} .. ${maxY.toFixed(4)}  height=${H.toFixed(4)}`)

// Slice along Y; in each slice report x-extent and cluster structure.
const SLICES = 72
const slices = Array.from({ length: SLICES }, () => [])
for (let i = 0; i < n; i++) {
  const y = pos[i * 3 + 1]
  const s = Math.min(SLICES - 1, Math.floor(((y - minY) / H) * SLICES))
  slices[s].push(pos[i * 3])
}

// 1D clustering on x with a gap threshold
function clusters(xs, gap) {
  if (!xs.length) return []
  const sorted = [...xs].sort((a, b) => a - b)
  const out = [[sorted[0]]]
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] > gap) out.push([])
    out[out.length - 1].push(sorted[i])
  }
  return out.map((c) => ({
    min: c[0],
    max: c[c.length - 1],
    mid: (c[0] + c[c.length - 1]) / 2,
    count: c.length,
  }))
}

const gap = H * 0.012
console.log('\n  y/H   yAbs     width   nClust  clusters (mid×count)')
const rows = []
for (let s = 0; s < SLICES; s++) {
  const xs = slices[s]
  if (!xs.length) continue
  const yAbs = minY + ((s + 0.5) / SLICES) * H
  const yn = (yAbs - minY) / H
  const cl = clusters(xs, gap).filter((c) => c.count > n / 6000)
  const width = Math.max(...xs) - Math.min(...xs)
  rows.push({ s, yn, yAbs, width, cl })
  const desc = cl.map((c) => `${c.mid.toFixed(3)}×${c.count}`).join(' | ')
  console.log(
    `  ${yn.toFixed(3)} ${yAbs.toFixed(4)}  ${width.toFixed(4)}   ${String(cl.length).padStart(2)}     ${desc}`,
  )
}

// Derived landmarks
const at = (yn) => rows.reduce((best, r) => (Math.abs(r.yn - yn) < Math.abs(best.yn - yn) ? r : best))
console.log('\n--- derived ---')
// widest slice in upper body = shoulders
const upper = rows.filter((r) => r.yn > 0.6 && r.yn < 0.88)
const shoulders = upper.reduce((a, b) => (b.width > a.width ? b : a))
console.log(`shoulder slice: yn=${shoulders.yn.toFixed(3)} y=${shoulders.yAbs.toFixed(4)} width=${shoulders.width.toFixed(4)}`)
// neck: narrowest slice above shoulders
const neckZone = rows.filter((r) => r.yn > shoulders.yn && r.yn < 0.92)
if (neckZone.length) {
  const neck = neckZone.reduce((a, b) => (b.width < a.width ? b : a))
  console.log(`neck slice:     yn=${neck.yn.toFixed(3)} y=${neck.yAbs.toFixed(4)} width=${neck.width.toFixed(4)}`)
}
// crotch: highest slice (scanning up from bottom) that still has 2 clusters
const twoCluster = rows.filter((r) => r.yn < 0.55 && r.cl.length === 2)
if (twoCluster.length) {
  const crotch = twoCluster.reduce((a, b) => (b.yn > a.yn ? b : a))
  console.log(
    `crotch:         yn=${crotch.yn.toFixed(3)} y=${crotch.yAbs.toFixed(4)}  legs at x=${crotch.cl.map((c) => c.mid.toFixed(3)).join(', ')}`,
  )
}
// arms: slices with 3 clusters -> [armA, torso, armB]
const three = rows.filter((r) => r.cl.length === 3 && r.yn > 0.4 && r.yn < 0.8)
console.log(`\nslices with 3 clusters (arms free of torso): ${three.length}`)
three.slice(0, 14).forEach((r) =>
  console.log(
    `  yn=${r.yn.toFixed(3)} y=${r.yAbs.toFixed(4)}  ${r.cl.map((c) => `${c.mid.toFixed(3)}×${c.count}`).join(' | ')}`,
  ),
)
