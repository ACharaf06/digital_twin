// Re-bind a Tripo-rigged GLB whose skin weights collapsed onto Root.
//
// Keeps Tripo's 33-joint skeleton (the joint placement is good) and recomputes
// JOINTS_0 / WEIGHTS_0 from scratch using geodesic distance over the mesh
// surface, then rewrites the inverse bind matrices and node transforms so the
// skeleton actually lines up with the geometry.
//
// The skeleton in these files is rotated 90 deg about Y relative to the mesh,
// so it is realigned first (see ALIGN_DEG). Verified by toe direction: the
// ToeBase bones must point the same way as the toe geometry (+Z).
//
// usage: node reweight.mjs in.glb out.glb

import { NodeIO } from '@gltf-transform/core'
import { EXTTextureWebP } from '@gltf-transform/extensions'

const IN = process.argv[2] || 'charaf-rigged.glb'
const OUT = process.argv[3] || 'charaf-rigged-skinned.glb'
const ALIGN_DEG = 270

const io = new NodeIO().registerExtensions([EXTTextureWebP])
const doc = await io.read(IN)
const root = doc.getRoot()
const skin = root.listSkins()[0]
if (!skin) throw new Error('no skin')
const joints = skin.listJoints()
const jointNames = joints.map((j) => j.getName())
const prim = root.listMeshes()[0].listPrimitives()[0]
const posArr = prim.getAttribute('POSITION').getArray()
const N = posArr.length / 3
const idx = prim.getIndices().getArray()

// ------------------------------------------------------------ matrix maths
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
  const i = new Array(16)
  i[0]=m[5]*m[10]*m[15]-m[5]*m[11]*m[14]-m[9]*m[6]*m[15]+m[9]*m[7]*m[14]+m[13]*m[6]*m[11]-m[13]*m[7]*m[10]
  i[4]=-m[4]*m[10]*m[15]+m[4]*m[11]*m[14]+m[8]*m[6]*m[15]-m[8]*m[7]*m[14]-m[12]*m[6]*m[11]+m[12]*m[7]*m[10]
  i[8]=m[4]*m[9]*m[15]-m[4]*m[11]*m[13]-m[8]*m[5]*m[15]+m[8]*m[7]*m[13]+m[12]*m[5]*m[11]-m[12]*m[7]*m[9]
  i[12]=-m[4]*m[9]*m[14]+m[4]*m[10]*m[13]+m[8]*m[5]*m[14]-m[8]*m[6]*m[13]-m[12]*m[5]*m[10]+m[12]*m[6]*m[9]
  i[1]=-m[1]*m[10]*m[15]+m[1]*m[11]*m[14]+m[9]*m[2]*m[15]-m[9]*m[3]*m[14]-m[13]*m[2]*m[11]+m[13]*m[3]*m[10]
  i[5]=m[0]*m[10]*m[15]-m[0]*m[11]*m[14]-m[8]*m[2]*m[15]+m[8]*m[3]*m[14]+m[12]*m[2]*m[11]-m[12]*m[3]*m[10]
  i[9]=-m[0]*m[9]*m[15]+m[0]*m[11]*m[13]+m[8]*m[1]*m[15]-m[8]*m[3]*m[13]-m[12]*m[1]*m[11]+m[12]*m[3]*m[9]
  i[13]=m[0]*m[9]*m[14]-m[0]*m[10]*m[13]-m[8]*m[1]*m[14]+m[8]*m[2]*m[13]+m[12]*m[1]*m[10]-m[12]*m[2]*m[9]
  i[2]=m[1]*m[6]*m[15]-m[1]*m[7]*m[14]-m[5]*m[2]*m[15]+m[5]*m[3]*m[14]+m[13]*m[2]*m[7]-m[13]*m[3]*m[6]
  i[6]=-m[0]*m[6]*m[15]+m[0]*m[7]*m[14]+m[4]*m[2]*m[15]-m[4]*m[3]*m[14]-m[12]*m[2]*m[7]+m[12]*m[3]*m[6]
  i[10]=m[0]*m[5]*m[15]-m[0]*m[7]*m[13]-m[4]*m[1]*m[15]+m[4]*m[3]*m[13]+m[12]*m[1]*m[7]-m[12]*m[3]*m[5]
  i[14]=-m[0]*m[5]*m[14]+m[0]*m[6]*m[13]+m[4]*m[1]*m[14]-m[4]*m[2]*m[13]-m[12]*m[1]*m[6]+m[12]*m[2]*m[5]
  i[3]=-m[1]*m[6]*m[11]+m[1]*m[7]*m[10]+m[5]*m[2]*m[11]-m[5]*m[3]*m[10]-m[9]*m[2]*m[7]+m[9]*m[3]*m[6]
  i[7]=m[0]*m[6]*m[11]-m[0]*m[7]*m[10]-m[4]*m[2]*m[11]+m[4]*m[3]*m[10]+m[8]*m[2]*m[7]-m[8]*m[3]*m[6]
  i[11]=-m[0]*m[5]*m[11]+m[0]*m[7]*m[9]+m[4]*m[1]*m[11]-m[4]*m[3]*m[9]-m[8]*m[1]*m[7]+m[8]*m[3]*m[5]
  i[15]=m[0]*m[5]*m[10]-m[0]*m[6]*m[9]-m[4]*m[1]*m[10]+m[4]*m[2]*m[9]+m[8]*m[1]*m[6]-m[8]*m[2]*m[5]
  let det = m[0]*i[0] + m[1]*i[4] + m[2]*i[8] + m[3]*i[12]
  if (Math.abs(det) < 1e-12) throw new Error('singular')
  det = 1 / det
  return i.map((v) => v * det)
}
function decompose(m) {
  const translation = [m[12], m[13], m[14]]
  let sx = Math.hypot(m[0], m[1], m[2])
  const sy = Math.hypot(m[4], m[5], m[6])
  const sz = Math.hypot(m[8], m[9], m[10])
  const det = m[0]*(m[5]*m[10]-m[6]*m[9]) - m[4]*(m[1]*m[10]-m[2]*m[9]) + m[8]*(m[1]*m[6]-m[2]*m[5])
  if (det < 0) sx = -sx
  const [r00,r01,r02,r10,r11,r12,r20,r21,r22] =
    [m[0]/sx, m[1]/sx, m[2]/sx, m[4]/sy, m[5]/sy, m[6]/sy, m[8]/sz, m[9]/sz, m[10]/sz]
  const tr = r00 + r11 + r22
  let q
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(r12-r21)/s, (r20-r02)/s, (r01-r10)/s, 0.25*s] }
  else if (r00 > r11 && r00 > r22) { const s = Math.sqrt(1+r00-r11-r22)*2; q = [0.25*s, (r10+r01)/s, (r20+r02)/s, (r12-r21)/s] }
  else if (r11 > r22) { const s = Math.sqrt(1+r11-r00-r22)*2; q = [(r10+r01)/s, 0.25*s, (r21+r12)/s, (r20-r02)/s] }
  else { const s = Math.sqrt(1+r22-r00-r11)*2; q = [(r20+r02)/s, (r21+r12)/s, 0.25*s, (r01-r10)/s] }
  const n = Math.hypot(...q) || 1
  return { translation, rotation: q.map((v) => v / n), scale: [sx, sy, sz] }
}

// ------------------------------------------- current world transforms + align
const nodeList = root.listNodes()
const parentOf = new Map()
nodeList.forEach((n) => n.listChildren().forEach((c) => parentOf.set(c, n)))
const localOf = (n) => {
  const t = n.getTranslation(), r = n.getRotation(), s = n.getScale()
  const [x,y,z,w] = r, [sx,sy,sz] = s
  const x2=x+x,y2=y+y,z2=z+z,xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2
  return [(1-(yy+zz))*sx,(xy+wz)*sx,(xz-wy)*sx,0,
          (xy-wz)*sy,(1-(xx+zz))*sy,(yz+wx)*sy,0,
          (xz+wy)*sz,(yz-wx)*sz,(1-(xx+yy))*sz,0,
          t[0],t[1],t[2],1]
}
const worldOf = new Map()
const computeWorld = (n) => {
  if (worldOf.has(n)) return worldOf.get(n)
  const p = parentOf.get(n)
  const m = mul(p ? computeWorld(p) : IDENTITY, localOf(n))
  worldOf.set(n, m)
  return m
}
nodeList.forEach(computeWorld)

const th = (ALIGN_DEG * Math.PI) / 180
const ALIGN = [Math.cos(th),0,-Math.sin(th),0, 0,1,0,0, Math.sin(th),0,Math.cos(th),0, 0,0,0,1]
const bindOf = new Map() // node -> aligned bind world matrix
nodeList.forEach((n) => bindOf.set(n, mul(ALIGN, worldOf.get(n))))
const posOf = (name) => {
  const n = nodeList.find((x) => x.getName() === name)
  if (!n) throw new Error(`missing bone ${name}`)
  const m = bindOf.get(n)
  return [m[12], m[13], m[14]]
}
console.log(`aligned skeleton by ${ALIGN_DEG}deg about Y`)

// ------------------------------------------------------- weighted bone table
// Weight goes on the twist/leaf bones, but each segment spans the articulation
// bones above it -- so rotating L_Upperarm carries the whole arm.
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k]
const SPEC = [
  ['Hip', 'Hip', 'Spine01', 0.16],
  ['Spine01', 'Spine01', 'Spine02', 0.16],
  ['Spine02', 'Spine02', 'NeckTwist01', 0.16],
  ['NeckTwist01', 'NeckTwist01', 'Head', 0.075],
  ['Head', 'Head', null, 0.13],
  ['L_UpperarmTwist01', 'L_Upperarm', 'L_Forearm', 0.055],
  ['L_ForearmTwist01', 'L_Forearm', 'L_Hand', 0.05],
  ['L_Hand', 'L_Hand', null, 0.055],
  ['R_UpperarmTwist01', 'R_Upperarm', 'R_Forearm', 0.055],
  ['R_ForearmTwist01', 'R_Forearm', 'R_Hand', 0.05],
  ['R_Hand', 'R_Hand', null, 0.055],
  ['L_ThighTwist01', 'L_Thigh', 'L_Calf', 0.075],
  ['L_CalfTwist01', 'L_Calf', 'L_Foot', 0.065],
  ['L_Foot', 'L_Foot', 'L_ToeBase', 0.07],
  ['R_ThighTwist01', 'R_Thigh', 'R_Calf', 0.075],
  ['R_CalfTwist01', 'R_Calf', 'R_Foot', 0.065],
  ['R_Foot', 'R_Foot', 'R_ToeBase', 0.07],
]
const TORSO = new Set(['Hip', 'Spine01', 'Spine02'])
const bones = SPEC.map(([weightBone, headName, tailName, radius]) => {
  const head = posOf(headName)
  let tail
  if (tailName) tail = posOf(tailName)
  else if (weightBone === 'Head') tail = add(head, [0, 0.13, 0])
  else tail = add(head, scale(sub(head, posOf(headName === 'L_Hand' ? 'L_Forearm' : 'R_Forearm')), 0.5))
  return { weightBone, head, tail, radius, jointIndex: jointNames.indexOf(weightBone) }
})
bones.forEach((b) => { if (b.jointIndex < 0) throw new Error(`bone ${b.weightBone} not in skin`) })
const NB = bones.length
console.log(`weighting ${NB} bones`)

function distToSeg(px, py, pz, a, b) {
  const dx = b[0]-a[0], dy = b[1]-a[1], dz = b[2]-a[2]
  const len2 = dx*dx + dy*dy + dz*dz || 1e-12
  let t = ((px-a[0])*dx + (py-a[1])*dy + (pz-a[2])*dz) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (a[0]+dx*t), py - (a[1]+dy*t), pz - (a[2]+dz*t))
}

// ------------------------------------------------- weld + surface adjacency
const q = 1e5
const seen = new Map()
const weldMap = new Int32Array(N)
let W = 0
for (let i = 0; i < N; i++) {
  const k = `${Math.round(posArr[i*3]*q)},${Math.round(posArr[i*3+1]*q)},${Math.round(posArr[i*3+2]*q)}`
  let w = seen.get(k)
  if (w === undefined) { w = W++; seen.set(k, w) }
  weldMap[i] = w
}
const wPos = new Float32Array(W * 3)
for (let i = 0; i < N; i++) {
  const w = weldMap[i]
  wPos[w*3] = posArr[i*3]; wPos[w*3+1] = posArr[i*3+1]; wPos[w*3+2] = posArr[i*3+2]
}
const nbrSet = Array.from({ length: W }, () => new Set())
for (let t = 0; t < idx.length; t += 3) {
  const a = weldMap[idx[t]], b = weldMap[idx[t+1]], c = weldMap[idx[t+2]]
  nbrSet[a].add(b); nbrSet[a].add(c); nbrSet[b].add(a); nbrSet[b].add(c); nbrSet[c].add(a); nbrSet[c].add(b)
}
const nbrStart = new Int32Array(W + 1)
let tot = 0
for (let v = 0; v < W; v++) { nbrStart[v] = tot; tot += nbrSet[v].size }
nbrStart[W] = tot
const nbr = new Int32Array(tot)
{ let p = 0; for (let v = 0; v < W; v++) for (const u of nbrSet[v]) nbr[p++] = u }
console.log(`vertices ${N} -> ${W} welded, ${tot} directed edges`)

// -------------------------------------------------- two-phase exclusive seeds
const seedOwner = new Int32Array(W).fill(-1)
const seedDist = new Float32Array(W).fill(Infinity)
const limbOwned = new Uint8Array(W)
for (let b = 0; b < NB; b++) {
  if (TORSO.has(bones[b].weightBone)) continue
  for (let v = 0; v < W; v++) {
    const d = distToSeg(wPos[v*3], wPos[v*3+1], wPos[v*3+2], bones[b].head, bones[b].tail)
    if (d < bones[b].radius && d < seedDist[v]) { seedDist[v] = d; seedOwner[v] = b; limbOwned[v] = 1 }
  }
}
for (let b = 0; b < NB; b++) {
  if (!TORSO.has(bones[b].weightBone)) continue
  for (let v = 0; v < W; v++) {
    if (limbOwned[v]) continue
    const d = distToSeg(wPos[v*3], wPos[v*3+1], wPos[v*3+2], bones[b].head, bones[b].tail)
    if (d < 0.19 && d < seedDist[v]) { seedDist[v] = d; seedOwner[v] = b }
  }
}
{
  const c = new Array(NB).fill(0)
  for (let v = 0; v < W; v++) if (seedOwner[v] >= 0) c[seedOwner[v]]++
  console.log('  seeds: ' + bones.map((b, i) => `${b.weightBone}=${c[i]}`).join(' '))
}

// --------------------------------------------------- geodesic labels
class Heap {
  constructor() { this.d = []; this.v = [] }
  get size() { return this.d.length }
  push(d, v) {
    this.d.push(d); this.v.push(v)
    let i = this.d.length - 1
    while (i > 0) { const p = (i-1)>>1; if (this.d[p] <= this.d[i]) break
      ;[this.d[p],this.d[i]]=[this.d[i],this.d[p]];[this.v[p],this.v[i]]=[this.v[i],this.v[p]]; i = p }
  }
  pop() {
    const td = this.d[0], tv = this.v[0]
    const ld = this.d.pop(), lv = this.v.pop()
    if (this.d.length) { this.d[0]=ld; this.v[0]=lv; let i=0
      for(;;){ const l=2*i+1,r=l+1; let s=i
        if(l<this.d.length&&this.d[l]<this.d[s])s=l
        if(r<this.d.length&&this.d[r]<this.d[s])s=r
        if(s===i)break
        ;[this.d[s],this.d[i]]=[this.d[i],this.d[s]];[this.v[s],this.v[i]]=[this.v[i],this.v[s]]; i=s } }
    return [td, tv]
  }
}
const elen = (a, b) => Math.hypot(wPos[a*3]-wPos[b*3], wPos[a*3+1]-wPos[b*3+1], wPos[a*3+2]-wPos[b*3+2])
const geo = []
for (let b = 0; b < NB; b++) {
  const dist = new Float32Array(W).fill(Infinity)
  const heap = new Heap()
  for (let v = 0; v < W; v++) if (seedOwner[v] === b) { dist[v] = seedDist[v]; heap.push(dist[v], v) }
  const done = new Uint8Array(W)
  while (heap.size) {
    const [d, v] = heap.pop()
    if (done[v]) continue
    done[v] = 1
    for (let p = nbrStart[v], e = nbrStart[v+1]; p < e; p++) {
      const u = nbr[p]
      if (done[u]) continue
      const nd = d + elen(v, u)
      if (nd < dist[u]) { dist[u] = nd; heap.push(nd, u) }
    }
  }
  geo.push(dist)
}
const label = new Int32Array(W)
const coreDist = new Float32Array(W)
for (let v = 0; v < W; v++) {
  let best = -1, bd = Infinity
  for (let b = 0; b < NB; b++) if (geo[b][v] < bd) { bd = geo[b][v]; best = b }
  if (best < 0) { // unreachable: nearest segment
    for (let b = 0; b < NB; b++) {
      const d = distToSeg(wPos[v*3], wPos[v*3+1], wPos[v*3+2], bones[b].head, bones[b].tail)
      if (d < bd) { bd = d; best = b }
    }
  }
  label[v] = best; coreDist[v] = bd
}

// ------------------------------------------------------------- diffusion
const K = 24, LAMBDA = 0.55
let Wt = new Float32Array(W * NB)
for (let v = 0; v < W; v++) Wt[v * NB + label[v]] = 1
const pinned = new Uint8Array(W)
for (let v = 0; v < W; v++) {
  const r = TORSO.has(bones[label[v]].weightBone) ? 0.19 : bones[label[v]].radius
  if (coreDist[v] < r * 0.85) pinned[v] = 1
}
let next = new Float32Array(W * NB)
for (let it = 0; it < K; it++) {
  for (let v = 0; v < W; v++) {
    const o = v * NB
    if (pinned[v]) { for (let b = 0; b < NB; b++) next[o+b] = Wt[o+b]; continue }
    const s = nbrStart[v], e = nbrStart[v+1]
    const inv = e > s ? 1/(e-s) : 0
    for (let b = 0; b < NB; b++) {
      let acc = 0
      for (let p = s; p < e; p++) acc += Wt[nbr[p]*NB + b]
      next[o+b] = (1-LAMBDA)*Wt[o+b] + LAMBDA*acc*inv
    }
  }
  const t = Wt; Wt = next; next = t
}
console.log(`diffused ${K} iterations (${pinned.reduce((a,b)=>a+b,0)} pinned)`)

// --------------------------------------------------------- top-4 per vertex
const JOINTS = new Uint8Array(N * 4)
const WEIGHTS = new Float32Array(N * 4)
for (let i = 0; i < N; i++) {
  const v = weldMap[i], o = v * NB
  const top = []
  for (let b = 0; b < NB; b++) if (Wt[o+b] > 0) top.push([Wt[o+b], b])
  top.sort((a, b) => b[0] - a[0])
  if (!top.length || top[0][0] < 1e-6) { top.length = 0; top.push([1, label[v]]) }
  const four = top.slice(0, 4)
  const sum = four.reduce((s, [w]) => s + w, 0) || 1
  for (let k = 0; k < 4; k++) {
    JOINTS[i*4+k] = four[k] ? bones[four[k][1]].jointIndex : bones[0].jointIndex
    WEIGHTS[i*4+k] = four[k] ? four[k][0] / sum : 0
  }
}

// ------------------------------------------- write skin, IBMs and transforms
const buffer = root.listBuffers()[0]
prim.setAttribute('JOINTS_0', doc.createAccessor('JOINTS_0').setType('VEC4').setArray(JOINTS).setBuffer(buffer))
prim.setAttribute('WEIGHTS_0', doc.createAccessor('WEIGHTS_0').setType('VEC4').setArray(WEIGHTS).setBuffer(buffer))

const ibm = new Float32Array(joints.length * 16)
joints.forEach((j, k) => ibm.set(invert(bindOf.get(j)), k * 16))
skin.setInverseBindMatrices(doc.createAccessor('IBM').setType('MAT4').setArray(ibm).setBuffer(buffer))

// bake the alignment into the node transforms so jointWorld == aligned bind
for (const n of nodeList) {
  if (n.getMesh()) continue
  const p = parentOf.get(n)
  const local = mul(invert(p ? bindOf.get(p) : IDENTITY), bindOf.get(n))
  const { translation, rotation, scale: sc } = decompose(local)
  n.setTranslation(translation).setRotation(rotation).setScale(sc)
}

await io.write(OUT, doc)
console.log(`wrote ${OUT}`)
