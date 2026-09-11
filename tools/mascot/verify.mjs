import { NodeIO } from '@gltf-transform/core'
import { EXTTextureWebP } from '@gltf-transform/extensions'
const io=new NodeIO().registerExtensions([EXTTextureWebP])
const doc=await io.read('charaf_rigged.glb')
const prim=doc.getRoot().listMeshes()[0].listPrimitives()[0]
const J=prim.getAttribute('JOINTS_0'), Wt=prim.getAttribute('WEIGHTS_0')
console.log('JOINTS_0 componentType:', J.getComponentType(), 'normalized:', J.getNormalized(), 'type:', J.getType())
console.log('WEIGHTS_0 componentType:', Wt.getComponentType(), 'normalized:', Wt.getNormalized())
const w=Wt.getArray(), j=J.getArray()
const n=w.length/4
let zero=0, bad=0, maxErr=0, badJoint=0
const skin=doc.getRoot().listSkins()[0]
const nJoints=skin.listJoints().length
for(let i=0;i<n;i++){
  const s=w[i*4]+w[i*4+1]+w[i*4+2]+w[i*4+3]
  if(s<1e-6) zero++
  else if(Math.abs(s-1)>1e-3){bad++; maxErr=Math.max(maxErr,Math.abs(s-1))}
  for(let k=0;k<4;k++) if(j[i*4+k]>=nJoints) badJoint++
}
console.log(`vertices=${n} joints=${nJoints}`)
console.log(`zero-weight vertices: ${zero}   (these collapse to the origin)`)
console.log(`weights not summing to 1: ${bad} (max err ${maxErr.toFixed(5)})`)
console.log(`out-of-range joint indices: ${badJoint}`)
