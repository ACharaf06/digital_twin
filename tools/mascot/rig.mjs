// Rig the generated mesh: build a humanoid skeleton from MediaPipe pose joints,
// compute skin weights by diffusing bone labels across the mesh surface graph
// (geodesic, so the arms don't drag the torso), and write a skinned GLB.
import { NodeIO } from '@gltf-transform/core'
import { EXTTextureWebP } from '@gltf-transform/extensions'
import { readFileSync } from 'node:fs'

const IN = process.argv[2] || 'charaf_body.glb'
const OUT = process.argv[3] || 'charaf_rigged.glb'
const J = JSON.parse(readFileSync('joints-mesh.json', 'utf8')).joints

const io = new NodeIO().registerExtensions([EXTTextureWebP])
const doc = await io.read(IN)
const root = doc.getRoot()
const mesh = root.listMeshes()[0]
const prim = mesh.listPrimitives()[0]
const posArr = prim.getAttribute('POSITION').getArray()
const N = posArr.length / 3
const idx = prim.getIndices().getArray()

let minY = Infinity, maxY = -Infinity
for (let i = 0; i < N; i++) {
  const y = posArr[i * 3 + 1]
  if (y < minY) minY = y
  if (y > maxY) maxY = y
}

// ---------------------------------------------------------------- skeleton
// mid-points and a few derived joints the pose model doesn't give directly
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
const hipC = mid(J.hip_L, J.hip_R)
const shoC = mid(J.shoulder_L, J.shoulder_R)
const headC = [0, (J.ear_L[1] + J.ear_R[1]) / 2]

// Bone table: name -> [x, y, z] head position (mesh space) and parent.
// Subject-right is -X (the character faces +Z), matching mascot.ts's arms[0].
const B = {
  Root:      { pos: [0, minY, 0], parent: null },
  Hips:      { pos: [0, hipC[1], 0], parent: 'Root' },
  Spine:     { pos: [0, hipC[1] + (shoC[1] - hipC[1]) * 0.34, 0], parent: 'Hips' },
  Chest:     { pos: [0, hipC[1] + (shoC[1] - hipC[1]) * 0.72, 0], parent: 'Spine' },
  Neck:      { pos: [0, shoC[1] + 0.035, 0], parent: 'Chest' },
  Head:      { pos: [0, shoC[1] + 0.075, 0], parent: 'Neck' },
  HeadTop:   { pos: [0, maxY, 0], parent: 'Head' },

  RightShoulder: { pos: [J.shoulder_R[0], J.shoulder_R[1], 0], parent: 'Chest' },
  RightElbow:    { pos: [J.elbow_R[0], J.elbow_R[1], 0], parent: 'RightShoulder' },
  RightHand:     { pos: [J.wrist_R[0], J.wrist_R[1], 0], parent: 'RightElbow' },
  RightHandEnd:  { pos: [J.wrist_R[0] - 0.005, J.wrist_R[1] - 0.055, 0], parent: 'RightHand' },

  LeftShoulder:  { pos: [J.shoulder_L[0], J.shoulder_L[1], 0], parent: 'Chest' },
  LeftElbow:     { pos: [J.elbow_L[0], J.elbow_L[1], 0], parent: 'LeftShoulder' },
  LeftHand:      { pos: [J.wrist_L[0], J.wrist_L[1], 0], parent: 'LeftElbow' },
  LeftHandEnd:   { pos: [J.wrist_L[0] + 0.005, J.wrist_L[1] - 0.055, 0], parent: 'LeftHand' },

  RightHip:   { pos: [J.hip_R[0], J.hip_R[1], 0], parent: 'Hips' },
  RightKnee:  { pos: [J.knee_R[0], J.knee_R[1], 0], parent: 'RightHip' },
  RightAnkle: { pos: [J.ankle_R[0], J.ankle_R[1], 0], parent: 'RightKnee' },
  RightFoot:  { pos: [J.ankle_R[0], minY, 0.035], parent: 'RightAnkle' },

  LeftHip:    { pos: [J.hip_L[0], J.hip_L[1], 0], parent: 'Hips' },
  LeftKnee:   { pos: [J.knee_L[0], J.knee_L[1], 0], parent: 'LeftHip' },
  LeftAnkle:  { pos: [J.ankle_L[0], J.ankle_L[1], 0], parent: 'LeftKnee' },
  LeftFoot:   { pos: [J.ankle_L[0], minY, 0.035], parent: 'LeftAnkle' },
}

// Bones that actually receive weight, each as a segment [head -> tail] for
// the nearest-bone test. Tips (HeadTop/HandEnd/Foot) are leaves, not weighted.
const SEG = [
  ['Hips', 'Spine'], ['Spine', 'Chest'], ['Chest', 'Neck'], ['Neck', 'Head'], ['Head', 'HeadTop'],
  ['RightShoulder', 'RightElbow'], ['RightElbow', 'RightHand'], ['RightHand', 'RightHandEnd'],
  ['LeftShoulder', 'LeftElbow'], ['LeftElbow', 'LeftHand'], ['LeftHand', 'LeftHandEnd'],
  ['RightHip', 'RightKnee'], ['RightKnee', 'RightAnkle'], ['RightAnkle', 'RightFoot'],
  ['LeftHip', 'LeftKnee'], ['LeftKnee', 'LeftAnkle'], ['LeftAnkle', 'LeftFoot'],
]
const boneNames = SEG.map(([h]) => h)
const NB = boneNames.length
console.log(`skeleton: ${Object.keys(B).length} nodes, ${NB} weighted bones`)

function distToSeg(px, py, pz, a, b) {
  const ax = a[0], ay = a[1], az = a[2] ?? 0
  const bx = b[0], by = b[1], bz = b[2] ?? 0
  const dx = bx - ax, dy = by - ay, dz = bz - az
  const len2 = dx * dx + dy * dy + dz * dz || 1e-12
  let t = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / len2
  t = Math.max(0, Math.min(1, t))
  const cx = ax + dx * t, cy = ay + dy * t, cz = az + dz * t
  return Math.hypot(px - cx, py - cy, pz - cz)
}

// ---------------------------------------------------- weld + adjacency graph
// The GLB splits vertices at UV seams; the surface graph must be built on
// spatially-welded positions or geodesics leak/disconnect.
const key = (i) => {
  const q = 1e5
  return `${Math.round(posArr[i * 3] * q)},${Math.round(posArr[i * 3 + 1] * q)},${Math.round(posArr[i * 3 + 2] * q)}`
}
const weldMap = new Int32Array(N)
const seen = new Map()
let W = 0
for (let i = 0; i < N; i++) {
  const k = key(i)
  let w = seen.get(k)
  if (w === undefined) { w = W++; seen.set(k, w) }
  weldMap[i] = w
}
console.log(`vertices: ${N} -> ${W} welded`)

const wPos = new Float32Array(W * 3)
for (let i = 0; i < N; i++) {
  const w = weldMap[i]
  wPos[w * 3] = posArr[i * 3]
  wPos[w * 3 + 1] = posArr[i * 3 + 1]
  wPos[w * 3 + 2] = posArr[i * 3 + 2]
}

const nbrSet = Array.from({ length: W }, () => new Set())
for (let t = 0; t < idx.length; t += 3) {
  const a = weldMap[idx[t]], b = weldMap[idx[t + 1]], c = weldMap[idx[t + 2]]
  nbrSet[a].add(b); nbrSet[a].add(c)
  nbrSet[b].add(a); nbrSet[b].add(c)
  nbrSet[c].add(a); nbrSet[c].add(b)
}
// flatten for speed
const nbrStart = new Int32Array(W + 1)
let total = 0
for (let v = 0; v < W; v++) { nbrStart[v] = total; total += nbrSet[v].size }
nbrStart[W] = total
const nbr = new Int32Array(total)
{
  let p = 0
  for (let v = 0; v < W; v++) for (const u of nbrSet[v]) nbr[p++] = u
}
console.log(`graph: ${total} directed edges (avg degree ${(total / W).toFixed(1)})`)

// ------------------------------------------------------- geodesic assignment
// Euclidean nearest-bone puts the whole side of the jacket on the arm (the arm
// hangs right beside it), which tears the torso when the shoulder rotates.
// Instead: seed each bone only with the surface hugging its axis, then let the
// distance travel *along the mesh*. Getting from the torso to the arm means
// going over the shoulder, so the torso stays with the chest.
// Seeding is two-phase and exclusive. The limbs are thin, so they claim the
// surface hugging their axis first. The torso axis sits ~0.13 from its own
// shell — as far as the arms are — so a radius that reaches the torso would
// also grab the arms. Letting the torso claim only what the limbs left over
// gives it a full shell of seeds without stealing the sleeves.
const LIMB_R = {
  Head: 0.115,
  RightShoulder: 0.034, RightElbow: 0.034, RightHand: 0.032,
  LeftShoulder: 0.034, LeftElbow: 0.034, LeftHand: 0.032,
  RightHip: 0.062, RightKnee: 0.052, RightAnkle: 0.052,
  LeftHip: 0.062, LeftKnee: 0.052, LeftAnkle: 0.052,
}
const TORSO_R = { Hips: 0.17, Spine: 0.17, Chest: 0.17, Neck: 0.09 }
const SEED_R = { ...LIMB_R, ...TORSO_R }

// phase 1: limbs claim tightly; phase 2: torso claims the remainder
const seedOwner = new Int32Array(W).fill(-1)
const seedDist = new Float32Array(W).fill(Infinity)
const limbOwned = new Uint8Array(W)
// phase 1: limbs, nearest wins
for (let b = 0; b < NB; b++) {
  const r = LIMB_R[boneNames[b]]
  if (r === undefined) continue
  const [h, t] = SEG[b]
  for (let v = 0; v < W; v++) {
    const d = distToSeg(wPos[v * 3], wPos[v * 3 + 1], wPos[v * 3 + 2], B[h].pos, B[t].pos)
    if (d < r && d < seedDist[v]) { seedDist[v] = d; seedOwner[v] = b; limbOwned[v] = 1 }
  }
}
// phase 2: torso bones compete for what the limbs did not take, nearest wins
for (let b = 0; b < NB; b++) {
  const r = TORSO_R[boneNames[b]]
  if (r === undefined) continue
  const [h, t] = SEG[b]
  for (let v = 0; v < W; v++) {
    if (limbOwned[v]) continue
    const d = distToSeg(wPos[v * 3], wPos[v * 3 + 1], wPos[v * 3 + 2], B[h].pos, B[t].pos)
    if (d < r && d < seedDist[v]) { seedDist[v] = d; seedOwner[v] = b }
  }
}
{
  const counts = new Array(NB).fill(0)
  for (let v = 0; v < W; v++) if (seedOwner[v] >= 0) counts[seedOwner[v]]++
  console.log('  seeds per bone: ' + boneNames.map((n, b) => `${n}=${counts[b]}`).join(' '))
}

class Heap {
  constructor() { this.d = []; this.v = [] }
  get size() { return this.d.length }
  push(dist, vert) {
    this.d.push(dist); this.v.push(vert)
    let i = this.d.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.d[p] <= this.d[i]) break
      ;[this.d[p], this.d[i]] = [this.d[i], this.d[p]]
      ;[this.v[p], this.v[i]] = [this.v[i], this.v[p]]
      i = p
    }
  }
  pop() {
    const topD = this.d[0], topV = this.v[0]
    const lastD = this.d.pop(), lastV = this.v.pop()
    if (this.d.length) {
      this.d[0] = lastD; this.v[0] = lastV
      let i = 0
      for (;;) {
        const l = 2 * i + 1, r = l + 1
        let s = i
        if (l < this.d.length && this.d[l] < this.d[s]) s = l
        if (r < this.d.length && this.d[r] < this.d[s]) s = r
        if (s === i) break
        ;[this.d[s], this.d[i]] = [this.d[i], this.d[s]]
        ;[this.v[s], this.v[i]] = [this.v[i], this.v[s]]
        i = s
      }
    }
    return [topD, topV]
  }
}

const edgeLen = (a, b) =>
  Math.hypot(
    wPos[a * 3] - wPos[b * 3],
    wPos[a * 3 + 1] - wPos[b * 3 + 1],
    wPos[a * 3 + 2] - wPos[b * 3 + 2],
  )

const geo = [] // geo[b][v] = geodesic-ish distance from bone b
for (let b = 0; b < NB; b++) {
  const r = SEED_R[boneNames[b]] ?? 0.05
  const dist = new Float32Array(W).fill(Infinity)
  const heap = new Heap()
  let seeds = 0
  for (let v = 0; v < W; v++) {
    if (seedOwner[v] !== b) continue
    dist[v] = seedDist[v]
    heap.push(seedDist[v], v)
    seeds++
  }
  const done = new Uint8Array(W)
  while (heap.size) {
    const [d, v] = heap.pop()
    if (done[v]) continue
    done[v] = 1
    for (let p = nbrStart[v], e = nbrStart[v + 1]; p < e; p++) {
      const u = nbr[p]
      if (done[u]) continue
      const nd = d + edgeLen(v, u)
      if (nd < dist[u]) { dist[u] = nd; heap.push(nd, u) }
    }
  }
  geo.push(dist)
  if (seeds === 0) console.log(`  WARNING: bone ${boneNames[b]} got no seeds (radius ${r})`)
}

const label = new Int32Array(W)
const coreDist = new Float32Array(W)
let unreachable = 0
for (let v = 0; v < W; v++) {
  let best = -1, bestD = Infinity
  for (let b = 0; b < NB; b++) if (geo[b][v] < bestD) { bestD = geo[b][v]; best = b }
  if (best < 0) {
    unreachable++
    // fall back to plain Euclidean so no vertex is left unskinned
    for (let b = 0; b < NB; b++) {
      const d = distToSeg(wPos[v * 3], wPos[v * 3 + 1], wPos[v * 3 + 2], B[SEG[b][0]].pos, B[SEG[b][1]].pos)
      if (d < bestD) { bestD = d; best = b }
    }
  }
  label[v] = best
  coreDist[v] = bestD
}
console.log(`geodesic labels assigned (${unreachable} vertices fell back to Euclidean)`)
{
  const stats = boneNames.map(() => ({ n: 0, minX: 1e9, maxX: -1e9, minY: 1e9, maxY: -1e9 }))
  for (let v = 0; v < W; v++) {
    const s = stats[label[v]]
    s.n++
    s.minX = Math.min(s.minX, wPos[v * 3]); s.maxX = Math.max(s.maxX, wPos[v * 3])
    s.minY = Math.min(s.minY, wPos[v * 3 + 1]); s.maxY = Math.max(s.maxY, wPos[v * 3 + 1])
  }
  console.log('  bone territory (welded verts won):')
  boneNames.forEach((n, b) => {
    const s = stats[b]
    if (!s.n) return console.log(`    ${n.padEnd(15)} 0`)
    console.log(
      `    ${n.padEnd(15)} ${String(s.n).padStart(5)}  x ${s.minX.toFixed(3)}..${s.maxX.toFixed(3)}  y ${s.minY.toFixed(3)}..${s.maxY.toFixed(3)}`,
    )
  })
}

// ------------------------------------------------ diffuse labels over surface
// Vertices very close to their bone stay pinned so limbs keep a rigid core;
// everything else relaxes, producing smooth falloff across each joint.
const K = 26, LAMBDA = 0.55
let Wt = new Float32Array(W * NB)
for (let v = 0; v < W; v++) Wt[v * NB + label[v]] = 1
// Pin each vertex relative to *its own* bone's seed radius. A flat threshold
// pins the thin arms but not the thick torso, so the arms diffuse into a chest
// that cannot push back — which is what dragged the jacket.
const pinned = new Uint8Array(W)
for (let v = 0; v < W; v++) {
  const r = SEED_R[boneNames[label[v]]] ?? 0.05
  if (coreDist[v] < r * 0.85) pinned[v] = 1
}
console.log(`pinned core vertices: ${pinned.reduce((a, b) => a + b, 0)} / ${W}`)

let next = new Float32Array(W * NB)
for (let it = 0; it < K; it++) {
  for (let v = 0; v < W; v++) {
    const o = v * NB
    if (pinned[v]) { for (let b = 0; b < NB; b++) next[o + b] = Wt[o + b]; continue }
    const s = nbrStart[v], e = nbrStart[v + 1]
    const inv = e > s ? 1 / (e - s) : 0
    for (let b = 0; b < NB; b++) {
      let acc = 0
      for (let p = s; p < e; p++) acc += Wt[nbr[p] * NB + b]
      next[o + b] = (1 - LAMBDA) * Wt[o + b] + LAMBDA * acc * inv
    }
  }
  const tmp = Wt; Wt = next; next = tmp
}
console.log(`diffused ${K} iterations`)

// ------------------------------------------------- hard cap on limb reach
// The sleeve is fused to the jacket panel in the generated mesh, so geodesic
// distance alone still leaks across the contact. A limb simply cannot own
// surface further from its axis than the limb is thick — enforce that, then
// renormalise. Without this the shoulder drags the whole jacket front.
const REACH = {
  RightShoulder: 0.062, RightElbow: 0.058, RightHand: 0.055,
  LeftShoulder: 0.062, LeftElbow: 0.058, LeftHand: 0.055,
  RightHip: 0.095, RightKnee: 0.085, RightAnkle: 0.085,
  LeftHip: 0.095, LeftKnee: 0.085, LeftAnkle: 0.085,
  Head: 0.17,
}
const USE_REACH_CAP = process.env.REACH_CAP === '1'
let clipped = 0
for (let v = 0; USE_REACH_CAP && v < W; v++) {
  const o = v * NB
  let touched = false
  for (let b = 0; b < NB; b++) {
    const cap = REACH[boneNames[b]]
    if (cap === undefined || Wt[o + b] === 0) continue
    const d = distToSeg(wPos[v * 3], wPos[v * 3 + 1], wPos[v * 3 + 2], B[SEG[b][0]].pos, B[SEG[b][1]].pos)
    if (d > cap) { Wt[o + b] = 0; touched = true }
  }
  if (!touched) continue
  clipped++
  let sum = 0
  for (let b = 0; b < NB; b++) sum += Wt[o + b]
  if (sum < 1e-6) {
    // Everything was clipped. Fall back to this vertex's own geodesic winner —
    // sending a stray sleeve vertex to the nearest torso bone would strand it
    // at the hip while its neighbours travel with the arm.
    Wt[o + label[v]] = 1
  }
}
console.log(`limb reach capped on ${clipped} vertices`)

// ------------------------------------------------------- top-4 per vertex
const JOINTS = new Uint8Array(N * 4)
const WEIGHTS = new Float32Array(N * 4)
for (let i = 0; i < N; i++) {
  const v = weldMap[i], o = v * NB
  const top = []
  for (let b = 0; b < NB; b++) {
    const w = Wt[o + b]
    if (w > 0) top.push([w, b])
  }
  top.sort((a, b) => b[0] - a[0])
  // A vertex whose weight is spread so thin that nothing survives would end up
  // with zero total influence and collapse to the origin — punching holes in
  // the mesh. Anything that thin falls back to its own label at full weight.
  if (!top.length || top[0][0] < 1e-6) {
    top.length = 0
    top.push([1, label[v]])
  }
  const four = top.slice(0, 4)
  const sum = four.reduce((s, [w]) => s + w, 0) || 1
  for (let k = 0; k < 4; k++) {
    JOINTS[i * 4 + k] = four[k] ? four[k][1] : 0
    WEIGHTS[i * 4 + k] = four[k] ? four[k][0] / sum : 0
  }
}

// ------------------------------------------------------------- build glTF
const buffer = root.listBuffers()[0]
const nodes = {}
for (const [name, spec] of Object.entries(B)) {
  const parentPos = spec.parent ? B[spec.parent].pos : [0, 0, 0]
  nodes[name] = doc
    .createNode(name)
    .setTranslation([
      spec.pos[0] - parentPos[0],
      spec.pos[1] - parentPos[1],
      (spec.pos[2] ?? 0) - (parentPos[2] ?? 0),
    ])
}
for (const [name, spec] of Object.entries(B)) {
  if (spec.parent) nodes[spec.parent].addChild(nodes[name])
}

// inverse bind matrices: bones are unrotated at bind, so this is just -worldPos
const ibm = new Float32Array(NB * 16)
boneNames.forEach((name, b) => {
  const p = B[name].pos
  const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -p[0], -p[1], -(p[2] ?? 0), 1]
  ibm.set(m, b * 16)
})

const skin = doc
  .createSkin('CharafRig')
  .setSkeleton(nodes.Root)
  .setInverseBindMatrices(
    doc.createAccessor('IBM').setType('MAT4').setArray(ibm).setBuffer(buffer),
  )
boneNames.forEach((name) => skin.addJoint(nodes[name]))

prim.setAttribute(
  'JOINTS_0',
  doc.createAccessor('JOINTS_0').setType('VEC4').setArray(JOINTS).setBuffer(buffer),
)
prim.setAttribute(
  'WEIGHTS_0',
  doc.createAccessor('WEIGHTS_0').setType('VEC4').setArray(WEIGHTS).setBuffer(buffer),
)

const scene = root.listScenes()[0]
// re-parent: skinned mesh node must be in the scene alongside the joint tree
const meshNode = root.listNodes().find((nd) => nd.getMesh() === mesh)
meshNode.setSkin(skin).setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1])
scene.addChild(nodes.Root)

await io.write(OUT, doc)
console.log(`\nwrote ${OUT}`)
