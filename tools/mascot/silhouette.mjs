// ASCII front-view occupancy map of the mesh: rows = Y, cols = X.
// Reveals where arms separate from the torso and where the legs split.
import { NodeIO } from '@gltf-transform/core'
import { EXTTextureWebP } from '@gltf-transform/extensions'

const io = new NodeIO().registerExtensions([EXTTextureWebP])
const doc = await io.read(process.argv[2] || 'charaf_body.glb')
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0]
const pos = prim.getAttribute('POSITION').getArray()
const n = pos.length / 3

let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
for (let i = 0; i < n; i++) {
  const x = pos[i * 3], y = pos[i * 3 + 1]
  if (x < minX) minX = x
  if (x > maxX) maxX = x
  if (y < minY) minY = y
  if (y > maxY) maxY = y
}
const ROWS = 56, COLS = 61
const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(0))
for (let i = 0; i < n; i++) {
  const x = pos[i * 3], y = pos[i * 3 + 1]
  const c = Math.min(COLS - 1, Math.floor(((x - minX) / (maxX - minX)) * COLS))
  const r = Math.min(ROWS - 1, Math.floor(((maxY - y) / (maxY - minY)) * ROWS))
  grid[r][c]++
}
const shade = (v) => (v === 0 ? '.' : v < 3 ? ':' : v < 10 ? '+' : v < 30 ? '*' : '#')
console.log(`X: ${minX.toFixed(3)}..${maxX.toFixed(3)}   Y: ${minY.toFixed(3)}..${maxY.toFixed(3)}`)
console.log('    ' + '-'.repeat(COLS))
grid.forEach((row, r) => {
  const y = maxY - ((r + 0.5) / ROWS) * (maxY - minY)
  const yn = (y - minY) / (maxY - minY)
  console.log(`${yn.toFixed(2)} ${y.toFixed(3).padStart(6)} |${row.map(shade).join('')}|`)
})
console.log('    ' + '-'.repeat(COLS))
// column ruler
const ticks = new Array(COLS).fill(' ')
for (let c = 0; c < COLS; c += 10) {
  const x = minX + ((c + 0.5) / COLS) * (maxX - minX)
  ticks[c] = '|'
  console.log(`col ${c} -> x=${x.toFixed(3)}`)
}
