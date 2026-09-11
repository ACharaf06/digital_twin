// Repair a skinned GLB whose joint nodes lost their transforms.
//
// Symptom: every bone node is `{"name": "..."}` with no translation/rotation,
// while the inverse bind matrices still hold the rest pose. Skinning needs
// jointWorld * IBM == identity at rest; with jointWorld == identity the mesh
// collapses toward the origin. (A `flatten`/`join` optimisation pass over a
// skinned mesh is the usual cause.)
//
// Fix: bindWorld = inverse(IBM), then local = inverse(parentBindWorld) * bindWorld.
// Bones that carry no IBM because they are not skin joints (the real
// articulation bones in a Tripo rig -- *_Upperarm, *_Forearm, *_Thigh, *_Calf)
// inherit the bind position of their first twist child, so they pivot at the
// anatomically correct spot.
//
// usage: node repair-rig.mjs in.glb out.glb

import { readFileSync, writeFileSync } from 'node:fs'

const IN = process.argv[2]
const OUT = process.argv[3]
if (!IN || !OUT) {
  console.error('usage: node repair-rig.mjs <in.glb> <out.glb>')
  process.exit(1)
}

// ---------------------------------------------------------------- glb io
const buf = readFileSync(IN)
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB')
const total = buf.readUInt32LE(8)
let off = 12
let json = null
let binChunk = null
let binPadded = null
while (off < total) {
  const len = buf.readUInt32LE(off)
  const type = buf.readUInt32LE(off + 4)
  const body = buf.subarray(off + 8, off + 8 + len)
  if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(body))
  if (type === 0x004e4942) {
    binChunk = body
    binPadded = buf.subarray(off + 8, off + 8 + len + ((4 - (len % 4)) % 4))
  }
  off += 8 + len + ((4 - (len % 4)) % 4)
}
const g = json

// ------------------------------------------------------------ matrix maths
// column-major 4x4, matching glTF
const mul = (a, b) => {
  const o = new Array(16)
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]
      o[c * 4 + r] = s
    }
  return o
}
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

function invert(m) {
  const inv = new Array(16)
  inv[0] = m[5]*m[10]*m[15] - m[5]*m[11]*m[14] - m[9]*m[6]*m[15] + m[9]*m[7]*m[14] + m[13]*m[6]*m[11] - m[13]*m[7]*m[10]
  inv[4] = -m[4]*m[10]*m[15] + m[4]*m[11]*m[14] + m[8]*m[6]*m[15] - m[8]*m[7]*m[14] - m[12]*m[6]*m[11] + m[12]*m[7]*m[10]
  inv[8] = m[4]*m[9]*m[15] - m[4]*m[11]*m[13] - m[8]*m[5]*m[15] + m[8]*m[7]*m[13] + m[12]*m[5]*m[11] - m[12]*m[7]*m[9]
  inv[12] = -m[4]*m[9]*m[14] + m[4]*m[10]*m[13] + m[8]*m[5]*m[14] - m[8]*m[6]*m[13] - m[12]*m[5]*m[10] + m[12]*m[6]*m[9]
  inv[1] = -m[1]*m[10]*m[15] + m[1]*m[11]*m[14] + m[9]*m[2]*m[15] - m[9]*m[3]*m[14] - m[13]*m[2]*m[11] + m[13]*m[3]*m[10]
  inv[5] = m[0]*m[10]*m[15] - m[0]*m[11]*m[14] - m[8]*m[2]*m[15] + m[8]*m[3]*m[14] + m[12]*m[2]*m[11] - m[12]*m[3]*m[10]
  inv[9] = -m[0]*m[9]*m[15] + m[0]*m[11]*m[13] + m[8]*m[1]*m[15] - m[8]*m[3]*m[13] - m[12]*m[1]*m[11] + m[12]*m[3]*m[9]
  inv[13] = m[0]*m[9]*m[14] - m[0]*m[10]*m[13] - m[8]*m[1]*m[14] + m[8]*m[2]*m[13] + m[12]*m[1]*m[10] - m[12]*m[2]*m[9]
  inv[2] = m[1]*m[6]*m[15] - m[1]*m[7]*m[14] - m[5]*m[2]*m[15] + m[5]*m[3]*m[14] + m[13]*m[2]*m[7] - m[13]*m[3]*m[6]
  inv[6] = -m[0]*m[6]*m[15] + m[0]*m[7]*m[14] + m[4]*m[2]*m[15] - m[4]*m[3]*m[14] - m[12]*m[2]*m[7] + m[12]*m[3]*m[6]
  inv[10] = m[0]*m[5]*m[15] - m[0]*m[7]*m[13] - m[4]*m[1]*m[15] + m[4]*m[3]*m[13] + m[12]*m[1]*m[7] - m[12]*m[3]*m[5]
  inv[14] = -m[0]*m[5]*m[14] + m[0]*m[6]*m[13] + m[4]*m[1]*m[14] - m[4]*m[2]*m[13] - m[12]*m[1]*m[6] + m[12]*m[2]*m[5]
  inv[3] = -m[1]*m[6]*m[11] + m[1]*m[7]*m[10] + m[5]*m[2]*m[11] - m[5]*m[3]*m[10] - m[9]*m[2]*m[7] + m[9]*m[3]*m[6]
  inv[7] = m[0]*m[6]*m[11] - m[0]*m[7]*m[10] - m[4]*m[2]*m[11] + m[4]*m[3]*m[10] + m[8]*m[2]*m[7] - m[8]*m[3]*m[6]
  inv[11] = -m[0]*m[5]*m[11] + m[0]*m[7]*m[9] + m[4]*m[1]*m[11] - m[4]*m[3]*m[9] - m[8]*m[1]*m[7] + m[8]*m[3]*m[5]
  inv[15] = m[0]*m[5]*m[10] - m[0]*m[6]*m[9] - m[4]*m[1]*m[10] + m[4]*m[2]*m[9] + m[8]*m[1]*m[6] - m[8]*m[2]*m[5]
  let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12]
  if (Math.abs(det) < 1e-12) throw new Error('singular matrix')
  det = 1 / det
  return inv.map((v) => v * det)
}

// decompose a 4x4 into translation / quaternion / scale
function decompose(m) {
  const translation = [m[12], m[13], m[14]]
  let sx = Math.hypot(m[0], m[1], m[2])
  const sy = Math.hypot(m[4], m[5], m[6])
  const sz = Math.hypot(m[8], m[9], m[10])
  // a negative determinant means one axis is mirrored
  const det =
    m[0] * (m[5] * m[10] - m[6] * m[9]) -
    m[4] * (m[1] * m[10] - m[2] * m[9]) +
    m[8] * (m[1] * m[6] - m[2] * m[5])
  if (det < 0) sx = -sx
  const r = [m[0] / sx, m[1] / sx, m[2] / sx, m[4] / sy, m[5] / sy, m[6] / sy, m[8] / sz, m[9] / sz, m[10] / sz]
  const [r00, r01, r02, r10, r11, r12, r20, r21, r22] = r
  const trace = r00 + r11 + r22
  let q
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2
    q = [(r12 - r21) / s, (r20 - r02) / s, (r01 - r10) / s, 0.25 * s]
  } else if (r00 > r11 && r00 > r22) {
    const s = Math.sqrt(1 + r00 - r11 - r22) * 2
    q = [0.25 * s, (r10 + r01) / s, (r20 + r02) / s, (r12 - r21) / s]
  } else if (r11 > r22) {
    const s = Math.sqrt(1 + r11 - r00 - r22) * 2
    q = [(r10 + r01) / s, 0.25 * s, (r21 + r12) / s, (r20 - r02) / s]
  } else {
    const s = Math.sqrt(1 + r22 - r00 - r11) * 2
    q = [(r20 + r02) / s, (r21 + r12) / s, 0.25 * s, (r01 - r10) / s]
  }
  const n = Math.hypot(...q) || 1
  return { translation, rotation: q.map((v) => v / n), scale: [sx, sy, sz] }
}

// -------------------------------------------------------- read bind poses
const skin = g.skins?.[0]
if (!skin) throw new Error('no skin in this file')
const acc = g.accessors[skin.inverseBindMatrices]
const bv = g.bufferViews[acc.bufferView]
const base = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0)
const ibmArray = new Float32Array(binChunk.buffer, binChunk.byteOffset + base, acc.count * 16)

const bindWorld = new Map() // node index -> 4x4
skin.joints.forEach((nodeIndex, k) => {
  const ibm = Array.from(ibmArray.slice(k * 16, k * 16 + 16))
  bindWorld.set(nodeIndex, invert(ibm))
})

const nodeByName = new Map(g.nodes.map((n, i) => [n.name, i]))
const parentOf = new Map()
g.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parentOf.set(c, i)))

// Articulation bones with no IBM borrow the bind pose of their twist child.
const BORROW = [
  ['L_Upperarm', 'L_UpperarmTwist01'], ['R_Upperarm', 'R_UpperarmTwist01'],
  ['L_Forearm', 'L_ForearmTwist01'], ['R_Forearm', 'R_ForearmTwist01'],
  ['L_Thigh', 'L_ThighTwist01'], ['R_Thigh', 'R_ThighTwist01'],
  ['L_Calf', 'L_CalfTwist01'], ['R_Calf', 'R_CalfTwist01'],
]
let borrowed = 0
for (const [target, source] of BORROW) {
  const t = nodeByName.get(target)
  const s = nodeByName.get(source)
  if (t == null || s == null || !bindWorld.has(s) || bindWorld.has(t)) continue
  bindWorld.set(t, bindWorld.get(s).slice())
  borrowed++
}
console.log(`bind poses: ${skin.joints.length} from IBMs, ${borrowed} borrowed for articulation bones`)

// ------------------------------------------------------ rewrite transforms
let written = 0
for (const [nodeIndex, world] of bindWorld) {
  let parentWorld = IDENTITY
  const p = parentOf.get(nodeIndex)
  if (p != null && bindWorld.has(p)) parentWorld = bindWorld.get(p)
  const local = mul(invert(parentWorld), world)
  const { translation, rotation, scale } = decompose(local)
  const node = g.nodes[nodeIndex]
  delete node.matrix
  const near = (v, t) => Math.abs(v - t) < 1e-7
  node.translation = translation
  node.rotation = rotation
  if (!(near(scale[0], 1) && near(scale[1], 1) && near(scale[2], 1))) node.scale = scale
  else delete node.scale
  written++
}
console.log(`rewrote ${written} node transforms`)

// ------------------------------------------------------------- write glb
const jsonText = JSON.stringify(g)
const jsonBytes = new TextEncoder().encode(jsonText)
const jsonPad = (4 - (jsonBytes.length % 4)) % 4
const jsonLen = jsonBytes.length + jsonPad
const binLen = binPadded ? binPadded.length : 0
const out = Buffer.alloc(12 + 8 + jsonLen + (binLen ? 8 + binLen : 0))
out.writeUInt32LE(0x46546c67, 0)
out.writeUInt32LE(2, 4)
out.writeUInt32LE(out.length, 8)
out.writeUInt32LE(jsonLen, 12)
out.writeUInt32LE(0x4e4f534a, 16)
Buffer.from(jsonBytes).copy(out, 20)
out.fill(0x20, 20 + jsonBytes.length, 20 + jsonLen) // pad JSON with spaces
if (binLen) {
  out.writeUInt32LE(binLen, 20 + jsonLen)
  out.writeUInt32LE(0x004e4942, 24 + jsonLen)
  Buffer.from(binPadded).copy(out, 28 + jsonLen)
}
writeFileSync(OUT, out)
console.log(`wrote ${OUT} (${(out.length / 1048576).toFixed(2)} MB)`)
