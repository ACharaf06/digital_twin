// Structural GLB inspector — no deps. Reads the JSON chunk straight out of the container.
import { readFileSync } from 'node:fs'

const path = process.argv[2]
if (!path) {
  console.error('usage: node inspect-glb.mjs <file.glb>')
  process.exit(1)
}
const buf = readFileSync(path)
const magic = buf.readUInt32LE(0)
if (magic !== 0x46546c67) throw new Error('not a GLB (bad magic)')
const version = buf.readUInt32LE(4)
const total = buf.readUInt32LE(8)
let offset = 12
let json = null
let binLength = 0
while (offset < total) {
  const chunkLength = buf.readUInt32LE(offset)
  const chunkType = buf.readUInt32LE(offset + 4)
  const body = buf.subarray(offset + 8, offset + 8 + chunkLength)
  if (chunkType === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(body))
  if (chunkType === 0x004e4942) binLength = chunkLength
  offset += 8 + chunkLength + ((4 - (chunkLength % 4)) % 4)
}

const g = json
const size = (n) => `${(n / 1048576).toFixed(2)} MB`
console.log(`\n=== ${path} ===`)
console.log(`glTF v${version}  file ${size(buf.length)}  bin ${size(binLength)}`)
console.log(`generator: ${g.asset?.generator ?? '?'}`)
console.log(
  `\ncounts: meshes=${g.meshes?.length ?? 0} nodes=${g.nodes?.length ?? 0} materials=${g.materials?.length ?? 0} textures=${g.textures?.length ?? 0} images=${g.images?.length ?? 0} skins=${g.skins?.length ?? 0} animations=${g.animations?.length ?? 0}`,
)
console.log(`extensions used: ${(g.extensionsUsed ?? []).join(', ') || '(none)'}`)

const acc = (i) => g.accessors?.[i]
let tris = 0
let verts = 0
console.log('\n--- meshes ---')
g.meshes?.forEach((m, mi) => {
  m.primitives.forEach((p, pi) => {
    const pos = acc(p.attributes.POSITION)
    const idx = p.indices != null ? acc(p.indices) : null
    const t = idx ? idx.count / 3 : pos.count / 3
    tris += t
    verts += pos.count
    const attrs = Object.keys(p.attributes).join(',')
    console.log(
      `  mesh[${mi}]${m.name ? ` "${m.name}"` : ''} prim[${pi}] tris=${t.toLocaleString()} verts=${pos.count.toLocaleString()} mat=${p.material ?? '-'}\n     attrs: ${attrs}\n     bounds min=${JSON.stringify(pos.min)} max=${JSON.stringify(pos.max)}`,
    )
  })
})
console.log(`  TOTAL tris=${tris.toLocaleString()} verts=${verts.toLocaleString()}`)

console.log('\n--- images / textures ---')
g.images?.forEach((im, i) => {
  const bv = im.bufferView != null ? g.bufferViews[im.bufferView] : null
  console.log(
    `  image[${i}] ${im.name ?? ''} mime=${im.mimeType ?? im.uri?.slice(0, 40) ?? '?'} ${bv ? size(bv.byteLength) : ''}`,
  )
})
g.materials?.forEach((m, i) => {
  const pbr = m.pbrMetallicRoughness ?? {}
  console.log(
    `  material[${i}] "${m.name ?? ''}" baseColorTex=${pbr.baseColorTexture?.index ?? '-'} metalRoughTex=${pbr.metallicRoughnessTexture?.index ?? '-'} normalTex=${m.normalTexture?.index ?? '-'} baseFactor=${JSON.stringify(pbr.baseColorFactor ?? '-')} metal=${pbr.metallicFactor ?? '-'} rough=${pbr.roughnessFactor ?? '-'}`,
  )
})

console.log('\n--- skins / skeleton ---')
if (!g.skins?.length) {
  console.log('  NO SKIN — static mesh, no bones')
} else {
  g.skins.forEach((s, i) => {
    console.log(`  skin[${i}] "${s.name ?? ''}" joints=${s.joints.length}`)
    const nameOf = (n) => g.nodes[n]?.name ?? `node${n}`
    // print the joint hierarchy
    const parentOf = new Map()
    g.nodes.forEach((n, ni) => (n.children ?? []).forEach((c) => parentOf.set(c, ni)))
    const roots = s.joints.filter((j) => !s.joints.includes(parentOf.get(j)))
    const walk = (n, depth) => {
      console.log(`     ${'  '.repeat(depth)}${nameOf(n)}`)
      ;(g.nodes[n].children ?? []).filter((c) => s.joints.includes(c)).forEach((c) => walk(c, depth + 1))
    }
    roots.forEach((r) => walk(r, 1))
  })
}

console.log('\n--- morph targets ---')
let morphs = 0
g.meshes?.forEach((m, mi) =>
  m.primitives.forEach((p, pi) => {
    if (p.targets?.length) {
      morphs += p.targets.length
      console.log(`  mesh[${mi}] prim[${pi}] targets=${p.targets.length} names=${JSON.stringify(m.extras?.targetNames ?? '-')}`)
    }
  }),
)
if (!morphs) console.log('  NO MORPH TARGETS — no blendshapes for blink/speech')

console.log('\n--- node tree (non-joint) ---')
const jointSet = new Set(g.skins?.flatMap((s) => s.joints) ?? [])
const printed = new Set()
const walkNode = (n, d) => {
  if (printed.has(n) || jointSet.has(n)) return
  printed.add(n)
  const node = g.nodes[n]
  const bits = []
  if (node.mesh != null) bits.push(`mesh=${node.mesh}`)
  if (node.skin != null) bits.push(`skin=${node.skin}`)
  if (node.translation) bits.push(`t=${node.translation.map((v) => v.toFixed(2))}`)
  if (node.scale) bits.push(`s=${node.scale.map((v) => v.toFixed(2))}`)
  if (node.rotation) bits.push(`r=${node.rotation.map((v) => v.toFixed(2))}`)
  console.log(`  ${'  '.repeat(d)}[${n}] ${node.name ?? ''} ${bits.join(' ')}`)
  ;(node.children ?? []).forEach((c) => walkNode(c, d + 1))
}
g.scenes?.[g.scene ?? 0]?.nodes?.forEach((n) => walkNode(n, 1))
console.log('')
