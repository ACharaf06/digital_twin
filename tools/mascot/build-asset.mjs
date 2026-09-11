// Build the shipped mascot asset: Tripo's rigged mesh plus every retargeted
// animation clip, merged into one GLB and trimmed for the web.
//
// The retarget endpoint returns animation-only GLBs that carry a copy of the
// skeleton but no mesh. Merging them in would duplicate the bones, so the
// clips are rebound by *name* onto the rigged model's own joints and the
// duplicate skeletons are dropped.
//
// usage: node build-asset.mjs <rigged.glb> <out.glb> <anim1.glb> [anim2.glb ...]

import { NodeIO } from '@gltf-transform/core'
import { mergeDocuments, resample, prune, dedup } from '@gltf-transform/functions'

const [rigged, out, ...animFiles] = process.argv.slice(2)
if (!rigged || !out || !animFiles.length) {
  console.error('usage: node build-asset.mjs <rigged.glb> <out.glb> <anim.glb ...>')
  process.exit(1)
}

const io = new NodeIO()
const doc = await io.read(rigged)
const root = doc.getRoot()

// index the model's own joints by name -- clips will be retargeted onto these
const targetByName = new Map()
for (const node of root.listNodes()) if (node.getName()) targetByName.set(node.getName(), node)
const beforeNodes = root.listNodes().length
console.log(`model: ${beforeNodes} nodes, ${root.listAnimations().length} animations`)

for (const file of animFiles) {
  const src = await io.read(file)
  const srcAnims = src.getRoot().listAnimations().length
  // note which nodes came from this file so they can be discarded afterwards
  const merged = mergeDocuments(doc, src)
  const added = []
  for (const anim of doc.getRoot().listAnimations()) {
    if (!anim.__seen) added.push(anim)
  }
  // rebind every channel of the newly merged animations onto the model's joints
  const existing = new Set()
  for (const anim of doc.getRoot().listAnimations()) {
    if (anim.__seen) continue
    anim.__seen = true
    let rebound = 0
    let dropped = 0
    for (const channel of anim.listChannels()) {
      const node = channel.getTargetNode()
      const name = node?.getName()
      const target = name ? targetByName.get(name) : null
      if (target && target !== node) {
        channel.setTargetNode(target)
        rebound++
      } else if (!target) {
        channel.dispose()
        dropped++
      }
    }
    existing.add(anim.getName())
    console.log(`  ${file} :: ${anim.getName()} -> rebound ${rebound}, dropped ${dropped}`)
  }
  void merged
  void srcAnims
}

// the merged-in skeletons and scenes are now unreferenced
for (const scene of root.listScenes()) {
  if (scene !== root.getDefaultScene()) scene.dispose()
}
for (const skin of root.listSkins()) {
  const used = root.listNodes().some((n) => n.getSkin() === skin)
  if (!used) skin.dispose()
}

// Retargeting drops the bind translation of some joints -- notably Hip, whose
// height (0.4568 here) becomes 0, sinking the whole character by that amount
// once scaled. Offset every translation track so frame 0 sits exactly on the
// bind pose, which restores the height while keeping the authored sway.
{
  let patched = 0
  for (const anim of root.listAnimations()) {
    for (const channel of anim.listChannels()) {
      if (channel.getTargetPath() !== 'translation') continue
      const node = channel.getTargetNode()
      const sampler = channel.getSampler()
      const output = sampler?.getOutput()
      if (!node || !output) continue
      const bind = node.getTranslation()
      const src = output.getArray()
      if (!src || src.length < 3) continue
      const dx = bind[0] - src[0]
      const dy = bind[1] - src[1]
      const dz = bind[2] - src[2]
      if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6 && Math.abs(dz) < 1e-6) continue
      // clone so clips that share an accessor are not offset twice
      const next = Float32Array.from(src)
      for (let i = 0; i < next.length; i += 3) {
        next[i] += dx
        next[i + 1] += dy
        next[i + 2] += dz
      }
      sampler.setOutput(
        doc.createAccessor(`${anim.getName()}:${node.getName()}:t`).setType('VEC3').setArray(next),
      )
      patched++
      console.log(
        `  re-grounded ${anim.getName().split(':').pop()} / ${node.getName()} by [${dx.toFixed(3)}, ${dy.toFixed(3)}, ${dz.toFixed(3)}]`,
      )
    }
  }
  console.log(`re-grounded ${patched} translation tracks`)
}

// drop nodes that are no longer reachable from the scene (the merged-in
// duplicate skeletons), keeping any node an animation or skin still targets
{
  const reachable = new Set()
  const walk = (node) => {
    if (reachable.has(node)) return
    reachable.add(node)
    node.listChildren().forEach(walk)
  }
  root.getDefaultScene()?.listChildren().forEach(walk)
  for (const node of root.listNodes()) if (!reachable.has(node)) node.dispose()
}

await doc.transform(
  resample({ tolerance: 1e-4 }), // drop keyframes that interpolation reproduces
  prune(),
  dedup(),
)

// merging brings a buffer per source document; GLB allows only one
{
  const buffers = root.listBuffers()
  const primary = buffers[0]
  for (const accessor of root.listAccessors()) accessor.setBuffer(primary)
  for (const buffer of buffers.slice(1)) buffer.dispose()
  console.log(`consolidated ${buffers.length} buffers -> 1`)
}

console.log(`\nfinal: ${root.listNodes().length} nodes, ${root.listAnimations().length} animations`)
for (const anim of root.listAnimations()) {
  let maxTime = 0
  for (const sampler of anim.listSamplers()) {
    const input = sampler.getInput()
    if (input) maxTime = Math.max(maxTime, input.getMax([0])[0] ?? 0)
  }
  console.log(`  ${anim.getName().padEnd(28)} ${maxTime.toFixed(2)}s  channels=${anim.listChannels().length}`)
}

await io.write(out, doc)
console.log(`\nwrote ${out}`)
