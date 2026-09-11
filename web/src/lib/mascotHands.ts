import * as THREE from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'

type HandPose = {
  rightWave: number
  leftWave: number
  rightPresent: number
  leftPresent: number
}

/** Clip crossing triangles at the cuff plane, preserving UVs and skin weights. */
function trimSleeves(geometry: THREE.BufferGeometry, planes: [number, number]) {
  const attributes = Object.entries(geometry.attributes)
  const values = new Map(
    attributes.map(([name, attribute]) => [
      name,
      Array.from({ length: attribute.count * attribute.itemSize }, (_, i) =>
        attribute.getComponent(Math.floor(i / attribute.itemSize), i % attribute.itemSize),
      ),
    ]),
  )
  const positions = values.get('position')!,
    joints = values.get('skinIndex')!,
    weights = values.get('skinWeight')!
  const cache = new Map<string, number>()
  const intersection = (a: number, b: number, plane: number) => {
    const key = `${Math.min(a, b)}:${Math.max(a, b)}:${plane}`
    if (cache.has(key)) return cache.get(key)!
    const t = (plane - positions[a * 3]) / (positions[b * 3] - positions[a * 3])
    const vertex = positions.length / 3
    for (const [name, attribute] of attributes) {
      if (name === 'skinIndex' || name === 'skinWeight') continue
      const list = values.get(name)!
      for (let component = 0; component < attribute.itemSize; component++)
        list.push(
          THREE.MathUtils.lerp(
            list[a * attribute.itemSize + component],
            list[b * attribute.itemSize + component],
            t,
          ),
        )
    }
    positions[vertex * 3] = plane
    const influence = new Map<number, number>()
    for (let channel = 0; channel < 4; channel++)
      for (const [source, amount] of [
        [a, 1 - t],
        [b, t],
      ]) {
        const bone = joints[source * 4 + channel]
        influence.set(bone, (influence.get(bone) ?? 0) + weights[source * 4 + channel] * amount)
      }
    const strongest = [...influence].sort((a, b) => b[1] - a[1]).slice(0, 4),
      total = strongest.reduce((sum, entry) => sum + entry[1], 0)
    for (let channel = 0; channel < 4; channel++) {
      joints.push(strongest[channel]?.[0] ?? 0)
      weights.push((strongest[channel]?.[1] ?? 0) / total)
    }
    cache.set(key, vertex)
    return vertex
  }
  const kept: number[] = []
  const index = geometry.index!
  for (let triangle = 0; triangle < index.count; triangle += 3) {
    let polygon = [index.getX(triangle), index.getX(triangle + 1), index.getX(triangle + 2)]
    planes.forEach((plane, side) => {
      const next: number[] = []
      for (let corner = 0; corner < polygon.length; corner++) {
        const a = polygon[(corner + polygon.length - 1) % polygon.length],
          b = polygon[corner]
        const insideA = side === 0 ? positions[a * 3] >= plane : positions[a * 3] <= plane
        const insideB = side === 0 ? positions[b * 3] >= plane : positions[b * 3] <= plane
        if (insideA !== insideB) next.push(intersection(a, b, plane))
        if (insideB) next.push(b)
      }
      polygon = next
    })
    for (let corner = 1; corner < polygon.length - 1; corner++)
      kept.push(polygon[0], polygon[corner], polygon[corner + 1])
  }
  for (const [name, attribute] of attributes) {
    const array =
      name === 'skinIndex'
        ? new Uint16Array(values.get(name)!)
        : new Float32Array(values.get(name)!)
    geometry.setAttribute(name, new THREE.BufferAttribute(array, attribute.itemSize))
  }
  geometry.setIndex(kept)
  const used = [...new Set(kept)]
  geometry.userData.cuffSeams = planes.map((plane) =>
    used.filter((vertex) => Math.abs(positions[vertex * 3] - plane) < 1e-6),
  )
}

/** Tailor the cloth to the wrist, retaining the hand's anatomical cross-section. */
function finishCuff(body: THREE.SkinnedMesh, side: number, hand: THREE.SkinnedMesh) {
  const geometry = body.geometry
  const seam = geometry.userData.cuffSeams[side] as number[]
  const positions = geometry.attributes.position
  const toHand = hand.matrixWorld.clone().invert().multiply(body.matrixWorld)
  const toBody = toHand.clone().invert()
  const point = new THREE.Vector3()
  const plane =
    seam.reduce(
      (sum, vertex) => sum + point.fromBufferAttribute(positions, vertex).applyMatrix4(toHand).y,
      0,
    ) / seam.length
  const handPositions = hand.geometry.attributes.position
  const handIndex = hand.geometry.index!
  const section: THREE.Vector3[] = []
  const a = new THREE.Vector3(),
    b = new THREE.Vector3()
  for (let triangle = 0; triangle < handIndex.count; triangle += 3) {
    for (let edge = 0; edge < 3; edge++) {
      a.fromBufferAttribute(handPositions, handIndex.getX(triangle + edge))
      b.fromBufferAttribute(handPositions, handIndex.getX(triangle + ((edge + 1) % 3)))
      if (a.y < plane !== b.y < plane) section.push(a.clone().lerp(b, (plane - a.y) / (b.y - a.y)))
    }
  }
  const center = new THREE.Box3().setFromPoints(section).getCenter(new THREE.Vector3())
  const outline = section
    .map((p) => ({
      angle: Math.atan2(p.z - center.z, p.x - center.x),
      radius: Math.hypot(p.x - center.x, p.z - center.z),
    }))
    .sort((a, b) => a.angle - b.angle)
  const radiusAt = (angle: number) => {
    let upper = outline.findIndex((p) => p.angle > angle)
    if (upper < 0) upper = 0
    const lower = (upper + outline.length - 1) % outline.length
    let a = outline[lower].angle,
      b = outline[upper].angle
    if (b < a) b += Math.PI * 2
    if (angle < a) angle += Math.PI * 2
    return THREE.MathUtils.lerp(
      outline[lower].radius,
      outline[upper].radius,
      (angle - a) / (b - a || 1),
    )
  }
  const changed = new Set<number>()
  const oldNormals = geometry.attributes.normal.clone()
  // Ease the last part of the cloth into a snug cuff. Expanding skin to fill
  // the old sleeve instead produces a flared wrist, especially from behind.
  for (let vertex = 0; vertex < positions.count; vertex++) {
    point.fromBufferAttribute(positions, vertex).applyMatrix4(toHand)
    if (point.y < plane - 0.2 || point.y > plane + 0.002 || Math.hypot(point.x, point.z) > 0.5)
      continue
    const blend = THREE.MathUtils.smoothstep(point.y, plane - 0.2, plane)
    const angle = Math.atan2(point.z - center.z, point.x - center.x)
    const radius = radiusAt(angle) + 0.009
    point.x = THREE.MathUtils.lerp(point.x, center.x + Math.cos(angle) * radius, blend)
    point.z = THREE.MathUtils.lerp(point.z, center.z + Math.sin(angle) * radius, blend)
    point.applyMatrix4(toBody)
    positions.setXYZ(vertex, point.x, point.y, point.z)
    changed.add(vertex)
  }
  // A narrow inward hem closes the cloth edge underneath the skin. It follows
  // the same forearm weights as the cuff, so a wrist bend cannot pull it open.
  const attributes = Object.entries(geometry.attributes)
  const values = new Map(
    attributes.map(([name, attribute]) => [
      name,
      Array.from({ length: attribute.count * attribute.itemSize }, (_, i) =>
        attribute.getComponent(Math.floor(i / attribute.itemSize), i % attribute.itemSize),
      ),
    ]),
  )
  const inner = new Map<number, number>()
  for (const vertex of seam) {
    const added = values.get('position')!.length / 3
    inner.set(vertex, added)
    point.fromBufferAttribute(positions, vertex).applyMatrix4(toHand)
    const angle = Math.atan2(point.z - center.z, point.x - center.x)
    const radius = Math.max(0.01, radiusAt(angle) - 0.004)
    point
      .set(center.x + Math.cos(angle) * radius, plane - 0.006, center.z + Math.sin(angle) * radius)
      .applyMatrix4(toBody)
    for (const [name, attribute] of attributes) {
      const list = values.get(name)!
      for (let channel = 0; channel < attribute.itemSize; channel++)
        list.push(
          name === 'position'
            ? point.getComponent(channel)
            : attribute.getComponent(vertex, channel),
        )
    }
  }
  const indices = Array.from(geometry.index!.array)
  const originalCount = indices.length
  for (let triangle = 0; triangle < originalCount; triangle += 3)
    for (let edge = 0; edge < 3; edge++) {
      const a = indices[triangle + edge],
        b = indices[triangle + ((edge + 1) % 3)]
      if (inner.has(a) && inner.has(b))
        indices.push(b, a, inner.get(a)!, b, inner.get(a)!, inner.get(b)!)
    }
  for (const [name, attribute] of attributes)
    geometry.setAttribute(
      name,
      new THREE.BufferAttribute(
        name === 'skinIndex'
          ? new Uint16Array(values.get(name)!)
          : new Float32Array(values.get(name)!),
        attribute.itemSize,
      ),
    )
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  const normals = geometry.attributes.normal
  for (let vertex = 0; vertex < oldNormals.count; vertex++)
    if (!changed.has(vertex))
      normals.setXYZ(
        vertex,
        oldNormals.getX(vertex),
        oldNormals.getY(vertex),
        oldNormals.getZ(vertex),
      )
  geometry.userData.cuffInnerSeams ??= [[], []]
  geometry.userData.cuffInnerSeams[side] = [...inner.values()]
}

/** Replace the malformed imported hands at the cuff; keep the character body. */
export function attachStudioHands(model: THREE.Group, template: THREE.Group) {
  model.updateWorldMatrix(true, true)
  const nativeHands = ['R_Hand', 'L_Hand'].map((name) => model.getObjectByName(name)!)
  // Tripo placed these wrist pivots inside the palms. Move each pivot back
  // to the cuff, compensating its inverse bind so the body keeps its rest shape.
  nativeHands.forEach((hand, index) => {
    const before = hand.matrixWorld.clone()
    const source = model.worldToLocal(hand.getWorldPosition(new THREE.Vector3()))
    source.x += index === 0 ? 0.033 : -0.03
    hand.position.copy(hand.parent!.worldToLocal(model.localToWorld(source)))
    hand.updateWorldMatrix(true, true)
    const correction = hand.matrixWorld.clone().invert().multiply(before)
    model.traverse((object) => {
      if (!(object instanceof THREE.SkinnedMesh)) return
      const joint = object.skeleton.bones.indexOf(hand as THREE.Bone)
      if (joint >= 0) object.skeleton.boneInverses[joint].premultiply(correction)
    })
  })
  const worldScale = model.getWorldScale(new THREE.Vector3()).x
  const cut = nativeHands.map(
    (hand) => model.worldToLocal(hand.getWorldPosition(new THREE.Vector3())).x,
  )
  // The original surface is a single skinned mesh. Remove only triangles past
  // the wrist plane. The replacement wrist extends inside the sleeve to hide it.
  const bodies: THREE.SkinnedMesh[] = []
  model.traverse((object) => {
    if (!(object instanceof THREE.SkinnedMesh)) return
    bodies.push(object)
    const geometry = object.geometry
    const index = geometry.index,
      position = geometry.attributes.position
    if (!index) return
    const skinIndex = geometry.attributes.skinIndex,
      skinWeight = geometry.attributes.skinWeight
    nativeHands.forEach((hand, index) => {
      const forearm = object.skeleton.bones.indexOf(hand.parent as THREE.Bone)
      if (forearm < 0) return
      for (let vertex = 0; vertex < position.count; vertex++) {
        const outward =
          index === 0 ? cut[index] - position.getX(vertex) : position.getX(vertex) - cut[index]
        const influence = THREE.MathUtils.smoothstep(outward, -0.05, -0.012)
        if (influence <= 0) continue
        const combined = new Map<number, number>([[forearm, influence]])
        for (let channel = 0; channel < 4; channel++) {
          const bone = skinIndex.getComponent(vertex, channel),
            weight = skinWeight.getComponent(vertex, channel) * (1 - influence)
          combined.set(bone, (combined.get(bone) ?? 0) + weight)
        }
        const strongest = [...combined].sort((a, b) => b[1] - a[1]).slice(0, 4)
        const total = strongest.reduce((sum, entry) => sum + entry[1], 0)
        for (let channel = 0; channel < 4; channel++) {
          skinIndex.setComponent(vertex, channel, strongest[channel]?.[0] ?? 0)
          skinWeight.setComponent(vertex, channel, (strongest[channel]?.[1] ?? 0) / total)
        }
      }
    })
    trimSleeves(geometry, [cut[0] + 0.003, cut[1] - 0.003])
  })
  const palms = nativeHands.map((native, index) => {
    const sign = index === 0 ? -1 : 1
    const holder = new THREE.Group()
    holder.name = index === 0 ? 'RightStudioHand' : 'LeftStudioHand'
    const sourceFrame = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(0, 0, -sign),
      new THREE.Vector3(sign, 0, 0),
      new THREE.Vector3(0, -1, 0),
    )
    holder.quaternion
      .copy(native.getWorldQuaternion(new THREE.Quaternion()).invert())
      .multiply(new THREE.Quaternion().setFromRotationMatrix(sourceFrame))
    // Scale the hand and its finger skeleton together; the cuff is fitted
    // independently below so reducing the palm cannot open a sleeve gap.
    const handScale = 0.8 / worldScale
    holder.scale.set((index === 0 ? 1 : -1) * handScale, handScale, handScale)
    native.add(holder)
    const hand = clone(template)
    hand.traverse((object) => {
      object.name = `Studio_${index}_${object.name}`
      if (object instanceof THREE.SkinnedMesh) {
        object.frustumCulled = false
        object.castShadow = true
        object.receiveShadow = true
        object.userData.hit = 'hand'
      }
    })
    holder.add(hand)
    model.updateWorldMatrix(true, true)
    // The cuff end follows the forearm; the palm follows the hand. Blend the
    // short wrist bridge between them instead of twisting it into a paper seam.
    hand.traverse((object) => {
      if (!(object instanceof THREE.SkinnedMesh)) return
      const anchor = new THREE.Bone()
      anchor.name = `Studio_${index}_wrist_anchor`
      native.parent!.add(anchor)
      const local = native.parent!.matrixWorld.clone().invert().multiply(object.matrixWorld)
      local.decompose(anchor.position, anchor.quaternion, anchor.scale)
      const old = object.skeleton
      const wristIndex = old.bones.length
      object.skeleton = new THREE.Skeleton(
        [...old.bones, anchor],
        [...old.boneInverses, new THREE.Matrix4()],
      )
      old.dispose()
      object.geometry = object.geometry.clone()
      const positions = object.geometry.attributes.position
      // Keep the source wrist narrow. The old source cuff remains hidden inside
      // the sleeve; discard it so its cloth cannot protrude through the new hem.
      const triangles = object.geometry.index!
      const kept: number[] = []
      for (let triangle = 0; triangle < triangles.count; triangle += 3) {
        const vertices = [0, 1, 2].map((corner) => triangles.getX(triangle + corner))
        if (vertices.every((vertex) => positions.getY(vertex) >= -0.027)) kept.push(...vertices)
      }
      object.geometry.setIndex(kept)
      bodies.forEach((body) => finishCuff(body, index, object))

      const indices = object.geometry.attributes.skinIndex
      const weights = object.geometry.attributes.skinWeight
      for (let vertex = 0; vertex < positions.count; vertex++) {
        const y = positions.getY(vertex)
        if (y >= 0.15) continue
        const amount = 1 - THREE.MathUtils.smoothstep(y, 0.01, 0.15)
        const influences = new Map<number, number>([[wristIndex, amount]])
        for (let channel = 0; channel < 4; channel++) {
          const bone = indices.getComponent(vertex, channel)
          const weight = weights.getComponent(vertex, channel) * (1 - amount)
          influences.set(bone, (influences.get(bone) ?? 0) + weight)
        }
        const strongest = [...influences].sort((a, b) => b[1] - a[1]).slice(0, 4)
        const total = strongest.reduce((sum, entry) => sum + entry[1], 0)
        for (let channel = 0; channel < 4; channel++) {
          indices.setComponent(vertex, channel, strongest[channel]?.[0] ?? 0)
          weights.setComponent(vertex, channel, (strongest[channel]?.[1] ?? 0) / total)
        }
      }
    })
    const fingerNames = ['index', 'middle', 'ring', 'pinky', 'thumb']
    const definitions = hand.getObjectByName(`Studio_${index}_StudioHand`)!.userData
      .fingers as Array<{ name: string; direction: [number, number, number] }>
    const directions = fingerNames.map(
      (name) => definitions.find((f) => f.name === name)!.direction,
    )
    return fingerNames.map((name, finger) => ({
      name,
      joints: [0, 1, 2].map((joint) => hand.getObjectByName(`Studio_${index}_${name}_${joint}`)!),
      axis: new THREE.Vector3(...directions[finger]).cross(new THREE.Vector3(0, 0, 1)).normalize(),
      rest: [0.2 + finger * 0.04, 0.38 + finger * 0.035, 0.16 + finger * 0.02],
    }))
  })
  const twist = new THREE.Quaternion()
  const zAxis = new THREE.Vector3(0, 0, 1)
  const update = (pose: HandPose, reduced = false) => {
    palms.forEach((fingers, hand) => {
      const wave = reduced ? 0 : hand === 0 ? pose.rightWave : pose.leftWave
      const present = reduced ? 0 : hand === 0 ? pose.rightPresent : pose.leftPresent
      fingers.forEach((finger) => {
        finger.joints.forEach((bone, joint) => {
          const relaxed = finger.name === 'thumb' ? [0.08, 0.15, 0.12][joint] : finger.rest[joint]
          const open = [0.025, 0.06, 0.025][joint]
          const cupped = [0.12, 0.2, 0.09][joint]
          const angle = THREE.MathUtils.lerp(
            THREE.MathUtils.lerp(relaxed, open, wave),
            cupped,
            present,
          )
          bone.quaternion.setFromAxisAngle(finger.axis, angle)
          if (finger.name === 'thumb' && joint === 0)
            bone.quaternion.premultiply(twist.setFromAxisAngle(zAxis, -0.12 * (1 - wave)))
        })
      })
    })
    model.updateMatrixWorld(true)
  }
  update({ rightWave: 0, leftWave: 0, rightPresent: 0, leftPresent: 0 })
  return { update }
}
