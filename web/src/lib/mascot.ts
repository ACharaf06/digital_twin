import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import faceData from './face-landmarks.json'
import { attachStudioHands } from './mascotHands'
import { createMascotMotion, type MascotMotion } from './mascotMotion'
export type { MascotMood, MascotAction } from './mascotMotion'

export type MascotRig = {
  root: THREE.Group
  body: THREE.Object3D
  head: THREE.Object3D
  face: THREE.Object3D
  eyes: Array<{ group: THREE.Object3D; iris: THREE.Object3D; position: THREE.Vector3 }>
  arms: Array<{ shoulder: THREE.Object3D; elbow: THREE.Object3D; hand: THREE.Object3D }>
  legs: Array<{ hip: THREE.Object3D; knee: THREE.Object3D }>
  mouth: THREE.Object3D
  teeth: THREE.Object3D
  setWireframe: (enabled: boolean) => void
  triangles: number
  updateFace: (blink: number, speech: number, gaze: THREE.Vector2) => void
  dispose: () => void
  motion?: MascotMotion
  hitTargets?: THREE.Object3D[]
}

const FACE_SCALE = 0.0055
const FACE_CENTER = { x: 0.738, y: 0.31, z: 0.012 }
const skinColor = 0xc68c68

function point(index: number) {
  const [x, y, z] = faceData.landmarks[index]
  return new THREE.Vector3(
    (x - FACE_CENTER.x) * faceData.width * FACE_SCALE,
    (FACE_CENTER.y - y) * faceData.height * FACE_SCALE,
    (FACE_CENTER.z - z) * faceData.width * FACE_SCALE + 0.28,
  )
}

export function createMascot(texture: THREE.Texture): MascotRig {
  const root = new THREE.Group()
  root.name = 'Charaf'
  const body = new THREE.Group()
  body.name = 'Spine'
  body.position.y = 1.12
  root.add(body)
  const resources: Array<{ dispose: () => void }> = []
  const material = (color: number, roughness = 0.85) => {
    const value = new THREE.MeshStandardMaterial({ color, roughness })
    resources.push(value)
    return value
  }
  const skin = material(skinColor, 0.84)
  const earInner = material(0xad7158)
  const shirt = material(0x586147)
  const shirtLight = material(0x666e51)
  const shirtDark = material(0x404b36)
  const pants = material(0x343a3c)
  const shoes = material(0xe9e6d9, 0.65)
  const sole = material(0xcacbbb)
  const hair = material(0x302219)
  const hairLight = material(0x443126)
  const dark = material(0x292823)
  const white = material(0xfff5df, 0.22)
  const irisMaterial = material(0x704125, 0.26)
  const pupilMaterial = material(0x130e0a, 0.1)
  const fibers = new Uint8Array(128 * 128)
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++)
      fibers[y * 128 + x] =
        128 + Math.sin(x * 1.7 + Math.sin(y * 0.6) * 2) * 42 + Math.sin(y * 2.1 + x * 0.3) * 28
  const fabricTexture = new THREE.DataTexture(fibers, 128, 128, THREE.RedFormat)
  fabricTexture.wrapS = fabricTexture.wrapT = THREE.RepeatWrapping
  fabricTexture.repeat.set(5, 5)
  fabricTexture.needsUpdate = true
  for (const cloth of [shirt, shirtLight, shirtDark]) {
    cloth.bumpMap = fabricTexture
    cloth.bumpScale = 0.018
    cloth.roughness = 0.98
  }
  resources.push(fabricTexture)

  const mesh = (
    geometry: THREE.BufferGeometry,
    mat: THREE.Material,
    parent: THREE.Object3D,
    name?: string,
  ) => {
    const object = new THREE.Mesh(geometry, mat)
    object.castShadow = true
    object.receiveShadow = true
    if (name) object.name = name
    parent.add(object)
    resources.push(geometry)
    return object
  }
  const ellipsoid = (
    parent: THREE.Object3D,
    mat: THREE.Material,
    scale: number[],
    position: number[],
    name?: string,
  ) => {
    const object = mesh(new THREE.SphereGeometry(1, 36, 28), mat, parent, name)
    object.scale.set(scale[0], scale[1], scale[2])
    object.position.set(position[0], position[1], position[2])
    return object
  }
  const capsule = (
    parent: THREE.Object3D,
    mat: THREE.Material,
    radius: number,
    length: number,
    position: number[],
    name?: string,
  ) => {
    const object = mesh(new THREE.CapsuleGeometry(radius, length, 8, 16), mat, parent, name)
    object.position.set(position[0], position[1], position[2])
    return object
  }
  const box = (
    parent: THREE.Object3D,
    mat: THREE.Material,
    size: number[],
    position: number[],
    radius = 0.04,
    name?: string,
  ) => {
    const object = mesh(
      new RoundedBoxGeometry(size[0], size[1], size[2], 3, radius),
      mat,
      parent,
      name,
    )
    object.position.set(position[0], position[1], position[2])
    return object
  }

  // Separate joint groups make every limb a real articulated 3D object.
  const torsoProfile = [
    [0, -0.05],
    [0.4, -0.05],
    [0.51, -0.025],
    [0.55, 0.06],
    [0.57, 0.3],
    [0.61, 0.66],
    [0.59, 0.91],
    [0.48, 1.12],
    [0.28, 1.23],
    [0.2, 1.25],
    [0, 1.25],
  ].map(([x, y]) => new THREE.Vector2(x, y))
  const torso = mesh(new THREE.LatheGeometry(torsoProfile, 64), shirt, body, 'Shirt')
  torso.scale.z = 0.65
  torso.userData.hit = 'body'
  const placketCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.1, 0.375),
    new THREE.Vector3(0, 0.4, 0.398),
    new THREE.Vector3(0, 0.7, 0.408),
    new THREE.Vector3(0, 0.96, 0.365),
    new THREE.Vector3(0, 1.14, 0.32),
  ])
  mesh(new THREE.TubeGeometry(placketCurve, 32, 0.016, 8, false), shirtDark, body)
  for (let i = 0; i < 5; i++) {
    const p = placketCurve.getPoint(0.1 + i * 0.205)
    const button = ellipsoid(body, dark, [0.029, 0.029, 0.016], [0.006, p.y, p.z + 0.012])
    button.rotation.x = -0.12
  }
  const pocket = box(body, shirtLight, [0.26, 0.3, 0.024], [0.32, 0.81, 0.331], 0.035)
  pocket.rotation.y = 0.18
  const pocketFlap = box(body, shirtDark, [0.265, 0.045, 0.019], [0.32, 0.95, 0.351], 0.01)
  pocketFlap.rotation.y = 0.18
  const collarShape = new THREE.Shape()
  collarShape.moveTo(0, 0)
  collarShape.lineTo(0.3, 0.12)
  collarShape.lineTo(0.34, -0.13)
  collarShape.lineTo(0.12, -0.26)
  collarShape.closePath()
  const collarGeo = new THREE.ExtrudeGeometry(collarShape, {
    depth: 0.035,
    bevelEnabled: true,
    bevelSize: 0.025,
    bevelThickness: 0.01,
    bevelSegments: 2,
    steps: 1,
  })
  const collarLeft = mesh(collarGeo, shirtLight, body)
  collarLeft.position.set(-0.31, 1.16, 0.24)
  collarLeft.rotation.y = -0.25
  const collarRight = collarLeft.clone()
  collarRight.scale.x = -1
  collarRight.position.x = 0.31
  collarRight.rotation.y = 0.25
  body.add(collarRight)
  capsule(body, skin, 0.205, 0.32, [0, 1.34, -0.025], 'Neck')

  const head = new THREE.Group()
  head.name = 'Head'
  head.userData.hit = 'head'
  head.position.set(0, 1.91, -0.025)
  body.add(head)
  // Continue the exact face boundary around a closed cranium, with sampled skin
  // colors at the join. A separate sphere leaves a visible gap in profile.
  const oval = faceData.oval.map((edge) => edge[0])
  const skullPositions: number[] = [],
    skullColors: number[] = [],
    skullIndices: number[] = []
  const sampling = document.createElement('canvas')
  sampling.width = faceData.width
  sampling.height = faceData.height
  const context = sampling.getContext('2d')!
  context.drawImage(texture.image, 0, 0)
  const pixels = context.getImageData(0, 0, sampling.width, sampling.height).data
  const samples = oval.map((index) => {
    const [x, y] = faceData.landmarks[index]
    const offset =
      (Math.round(y * sampling.height) * sampling.width + Math.round(x * sampling.width)) * 4
    return new THREE.Color().setRGB(
      pixels[offset] / 255,
      pixels[offset + 1] / 255,
      pixels[offset + 2] / 255,
      THREE.SRGBColorSpace,
    )
  })
  for (let ring = 0; ring <= 12; ring++) {
    const angle = ((ring / 12) * Math.PI) / 2
    oval.forEach((index, i) => {
      const p = point(index)
      const radius = Math.cos(angle) * (1 + Math.sin(angle) * 0.1)
      skullPositions.push(
        p.x * radius,
        0.03 + (p.y - 0.03) * radius,
        THREE.MathUtils.lerp(p.z, -0.72, Math.sin(angle)),
      )
      const color = samples[i].clone().lerp(new THREE.Color(skinColor), Math.sin(angle) * 0.75)
      skullColors.push(color.r, color.g, color.b)
      if (ring < 12) {
        const a = ring * oval.length + i,
          b = ring * oval.length + ((i + 1) % oval.length),
          c = a + oval.length,
          d = b + oval.length
        skullIndices.push(a, c, b, b, c, d)
      }
    })
  }
  const skullGeo = new THREE.BufferGeometry()
  skullGeo.setAttribute('position', new THREE.Float32BufferAttribute(skullPositions, 3))
  skullGeo.setAttribute('color', new THREE.Float32BufferAttribute(skullColors, 3))
  skullGeo.setIndex(skullIndices)
  skullGeo.computeVertexNormals()
  const skullMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    side: THREE.DoubleSide,
  })
  resources.push(skullMat)
  const skull = mesh(skullGeo, skullMat, head, 'ContinuousCranium')
  skull.userData.hit = 'head'
  for (const side of [-1, 1]) {
    const ear = ellipsoid(head, skin, [0.14, 0.225, 0.125], [side * 0.62, -0.005, -0.02], 'Ear')
    ear.rotation.z = side * -0.18
    ellipsoid(head, earInner, [0.075, 0.135, 0.05], [side * 0.67, -0.012, 0.085])
  }

  const positions: number[] = [],
    uv: number[] = []
  for (let i = 0; i < 468; i++) {
    const p = point(i)
    positions.push(p.x, p.y, p.z)
    uv.push(faceData.landmarks[i][0], 1 - faceData.landmarks[i][1])
  }
  const faceGeometry = new THREE.BufferGeometry()
  faceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  faceGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  faceGeometry.setIndex(faceData.triangles)
  faceGeometry.computeVertexNormals()
  const faceMaterial = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.96,
    side: THREE.DoubleSide,
    color: 0xffffff,
  })
  const face = mesh(faceGeometry, faceMaterial, head, 'OriginalFace')
  face.userData.hit = 'head'
  resources.push(faceMaterial)
  const restPositions = new Float32Array(positions)
  let faceDirty = true
  const lipCenter = point(13).lerp(point(14), 0.5)
  const mouth = ellipsoid(
    head,
    material(0x281610),
    [0.21, 0.038, 0.045],
    [lipCenter.x, lipCenter.y - 0.018, lipCenter.z - 0.035],
    'Mouth',
  )
  const teeth = box(
    head,
    white,
    [0.245, 0.045, 0.025],
    [lipCenter.x, lipCenter.y - 0.02, lipCenter.z + 0.003],
    0.015,
  )
  teeth.visible = false

  const makeEye = (index: number) => {
    const position = point(index)
    const eye = new THREE.Group()
    eye.name = index === 468 ? 'RightEye' : 'LeftEye'
    eye.position.copy(position)
    eye.position.z -= 0.08
    head.add(eye)
    ellipsoid(eye, white, [0.129, 0.095, 0.088], [0, 0, 0])
    const iris = new THREE.Group()
    iris.position.z = 0.077
    eye.add(iris)
    ellipsoid(iris, irisMaterial, [0.066, 0.071, 0.019], [0, 0, 0])
    ellipsoid(iris, pupilMaterial, [0.031, 0.039, 0.012], [0, 0, 0.018])
    ellipsoid(iris, white, [0.014, 0.017, 0.008], [-0.018, 0.027, 0.029])
    ellipsoid(iris, white, [0.006, 0.007, 0.004], [0.023, -0.02, 0.023])
    return { group: eye, iris, position }
  }
  const eyes = [makeEye(468), makeEye(473)]
  const eyeIndices = [faceData.rightEye, faceData.leftEye].map((edges) => [
    ...new Set(edges.flat()),
  ])

  // Volumetric curls cover the cranium, including the sides and back.
  const hairGeometry = new THREE.SphereGeometry(1, 64, 32)
  const hairAttribute = hairGeometry.getAttribute('position')
  for (let i = 0; i < hairAttribute.count; i++) {
    const x = hairAttribute.getX(i),
      y = hairAttribute.getY(i),
      z = hairAttribute.getZ(i)
    const bottom = z > 0 ? 0.48 + z * 0.12 : -0.23
    hairAttribute.setXYZ(i, x * 0.67, Math.max(bottom, 0.57 + y * 0.63), -0.19 + z * 0.51)
  }
  hairGeometry.computeVertexNormals()
  mesh(hairGeometry, hair, head, 'HairCap')
  const curlGeometry = new THREE.TorusKnotGeometry(0.041, 0.023, 28, 5, 2, 3)
  const curlPositions: { position: THREE.Vector3; scale: number; angle: number }[] = []
  for (let i = 0; i < 1800; i++) {
    const u = (i + 0.5) / 1800
    const y = 1 - 2 * u
    const radius = Math.sqrt(1 - y * y)
    const angle = i * 2.399963
    const x = Math.cos(angle) * radius,
      z = Math.sin(angle) * radius
    const py = 0.6 + y * 0.68
    if (py < (z > 0 ? 0.48 + z * 0.15 : -0.21)) continue
    curlPositions.push({
      position: new THREE.Vector3(x * 0.7, py, -0.19 + z * 0.55),
      scale: 0.8 + ((i * 31) % 19) / 38,
      angle,
    })
  }
  const curls = new THREE.InstancedMesh(curlGeometry, hairLight, curlPositions.length)
  curls.name = 'SculptedCurls'
  curls.castShadow = true
  const dummy = new THREE.Object3D()
  curlPositions.forEach(({ position, scale, angle }, i) => {
    dummy.position.copy(position)
    dummy.rotation.set(angle * 0.33, angle * 0.71, angle)
    dummy.scale.set(scale, scale * 1.08, scale * 0.9)
    dummy.updateMatrix()
    curls.setMatrixAt(i, dummy.matrix)
    curls.setColorAt(i, new THREE.Color().setHSL(0.065, 0.27, 0.105 + (i % 9) * 0.005))
  })
  head.add(curls)
  resources.push(curlGeometry)
  const makeArm = (side: number) => {
    const shoulder = new THREE.Group()
    shoulder.name = side < 0 ? 'RightShoulder' : 'LeftShoulder'
    shoulder.position.set(side * 0.56, 1.09, 0)
    body.add(shoulder)
    capsule(shoulder, shirt, 0.185, 0.43, [0, -0.29, 0])
    const elbow = new THREE.Group()
    elbow.name = `${shoulder.name}Elbow`
    elbow.position.y = -0.59
    shoulder.add(elbow)
    capsule(elbow, shirt, 0.15, 0.31, [0, -0.2, 0.025])
    const cuff = capsule(elbow, shirtDark, 0.152, 0.05, [0, -0.4, 0.027])
    cuff.rotation.x = -0.04
    const hand = new THREE.Group()
    hand.name = `${shoulder.name}Hand`
    hand.userData.hit = 'hand'
    hand.position.set(0, -0.53, 0.03)
    elbow.add(hand)
    const palm = ellipsoid(hand, skin, [0.115, 0.145, 0.077], [0, 0, 0], 'Palm')
    palm.userData.hit = 'hand'
    for (let i = 0; i < 4; i++) {
      const finger = capsule(hand, skin, 0.025, 0.11 + Math.sin(i * 1.1) * 0.026, [
        (i - 1.5) * 0.047,
        -0.145,
        0,
      ])
      finger.rotation.z = (i - 1.5) * 0.06
    }
    const thumb = capsule(hand, skin, 0.035, 0.086, [side * 0.115, -0.008, 0.028])
    thumb.rotation.z = side * -0.55
    return { shoulder, elbow, hand }
  }
  const arms = [makeArm(-1), makeArm(1)]
  arms[0].shoulder.rotation.z = -0.08
  arms[1].shoulder.rotation.z = 0.11
  arms[1].elbow.rotation.x = -0.25

  const legs = [-1, 1].map((side) => {
    const hip = new THREE.Group()
    hip.name = side < 0 ? 'RightHip' : 'LeftHip'
    hip.position.set(side * 0.245, 1.09, -0.01)
    root.add(hip)
    capsule(hip, pants, 0.205, 0.45, [0, -0.32, 0])
    const knee = new THREE.Group()
    knee.name = `${hip.name}Knee`
    knee.position.y = -0.58
    hip.add(knee)
    capsule(knee, pants, 0.168, 0.22, [0, -0.155, 0])
    box(knee, shoes, [0.4, 0.24, 0.66], [0, -0.35, 0.13], 0.11, 'Sneaker')
    box(knee, sole, [0.415, 0.074, 0.68], [0, -0.441, 0.13], 0.035)
    for (let i = 0; i < 3; i++)
      box(knee, sole, [0.21, 0.014, 0.021], [0, -0.227, 0.17 + i * 0.065], 0.005)
    return { hip, knee }
  })

  const geometries = new Set<THREE.BufferGeometry>()
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) geometries.add(object.geometry)
  })
  const surfaceMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) surfaceMaterials.set(object, object.material)
  })
  const digitalMaterial = new THREE.MeshBasicMaterial({
    color: 0x365beb,
    wireframe: true,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  })
  resources.push(digitalMaterial)
  return {
    root,
    body,
    head,
    face,
    eyes,
    arms,
    legs,
    mouth,
    teeth,
    setWireframe(enabled: boolean) {
      surfaceMaterials.forEach((original, object) => {
        object.material = enabled ? digitalMaterial : original
      })
      curls.visible = !enabled
    },
    triangles: [...geometries].reduce(
      (sum, geometry) =>
        sum + (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3,
      0,
    ),
    updateFace(blink: number, speech: number, gaze: THREE.Vector2) {
      // Only re-upload the vertex buffer while the face is actually deforming
      // (a blink or speech), plus one settle frame back to rest. Idle frames
      // just move the (cheap) eyeball/iris transforms.
      const deform = blink > 0.0001 || speech > 0.0001
      if (deform || faceDirty) {
        const attribute = faceGeometry.getAttribute('position') as THREE.BufferAttribute
        attribute.array.set(restPositions)
        const mouthY = lipCenter.y
        for (let i = 0; i < 468; i++) {
          const y = restPositions[i * 3 + 1]
          const weight = THREE.MathUtils.smoothstep(mouthY - y, -0.015, 0.38)
          attribute.setY(i, y - speech * 0.095 * weight)
        }
        eyeIndices.forEach((indices, side) => {
          const center = eyes[side].position.y
          indices.forEach((index) =>
            attribute.setY(
              index,
              THREE.MathUtils.lerp(attribute.getY(index), center, blink * 0.98),
            ),
          )
        })
        attribute.needsUpdate = true
        faceDirty = deform
      }
      eyes.forEach((eye) => {
        eye.group.scale.y = 1 - blink * 0.96
        eye.iris.position.x = gaze.x * 0.026
        eye.iris.position.y = gaze.y * 0.019
      })
      mouth.scale.y = 0.038 * (1 + speech * 3)
      mouth.position.y = lipCenter.y - 0.018 - speech * 0.042
      mouth.visible = speech > 0.05
      teeth.visible = speech > 0.25
    },
    dispose() {
      ;[...new Set(resources)].forEach((resource) => resource.dispose())
    },
  }
}

/**
 * Wrap an unrigged generated GLB in the same interface as the procedural
 * character. The whole-character actions (jump, spin and reset), hit testing,
 * framing and wireframe view keep working immediately. Limb and facial motion
 * remain inert until the generated asset is replaced by its rigged export.
 */
export function createGeneratedMascot(model: THREE.Group, handTemplate?: THREE.Group): MascotRig {
  const root = new THREE.Group()
  root.name = 'CharafGenerated'

  const sourceBounds = new THREE.Box3().setFromObject(model)
  const sourceSize = sourceBounds.getSize(new THREE.Vector3())
  const targetHeight = 4
  const scale = sourceSize.y > 0 ? targetHeight / sourceSize.y : 1
  model.scale.multiplyScalar(scale)
  model.updateMatrixWorld(true)

  const scaledBounds = new THREE.Box3().setFromObject(model)
  const scaledCenter = scaledBounds.getCenter(new THREE.Vector3())
  model.position.x -= scaledCenter.x
  model.position.y -= scaledBounds.min.y
  model.position.z -= scaledCenter.z
  model.updateMatrixWorld(true)
  root.add(model)
  const hands = handTemplate ? attachStudioHands(model, handTemplate) : null

  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  const surfaceMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()
  const skeletons = new Set<THREE.Skeleton>()

  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.castShadow = true
    object.receiveShadow = true
    object.userData.hit = 'body'
    // A conservative envelope avoids stale bind-pose bounds during gestures.
    if (object instanceof THREE.SkinnedMesh) {
      object.frustumCulled = false
      skeletons.add(object.skeleton)
    }
    geometries.add(object.geometry)
    surfaceMaterials.set(object, object.material)
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material]
    meshMaterials.forEach((material) => {
      materials.add(material)
      Object.values(material).forEach((value) => {
        if (value instanceof THREE.Texture) textures.add(value)
      })
    })
  })

  const digitalMaterial = new THREE.MeshBasicMaterial({
    color: 0x365beb,
    wireframe: true,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  })

  const joint = (
    name: string,
    position: [number, number, number],
    parent: THREE.Object3D = root,
  ) => {
    const object = new THREE.Group()
    object.name = name
    object.position.set(...position)
    parent.add(object)
    return object
  }

  // Bind to the real skeleton so stage rotations actually deform the mesh.
  // Tripo names the articulation bones *_Upperarm / *_Forearm / *_Thigh /
  // *_Calf; those are not skin joints themselves, but the twist bones that
  // carry the weights hang off them, so rotating them moves the whole limb.
  const bones = new Map<string, THREE.Object3D>()
  model.traverse((object) => {
    if (object.name) bones.set(object.name, object)
  })
  const bone = (name: string, fallback: [number, number, number]): THREE.Object3D => {
    const found = bones.get(name)
    if (found) return found
    // Missing bone: fall back to a detached anchor so the studio still runs.
    console.warn(`[mascot] bone "${name}" not found in the generated model`)
    return joint(`${name}Fallback`, fallback)
  }

  // The authored motion controller restores the bind transforms before solving
  // each pose. Keep anchors on the real joints so picking follows the skin.
  const body = bone('Spine01', [0, 2.05, 0])
  const head = bone('Head', [0, 3.42, 0])
  const face = joint('GeneratedFace', [0, 0, 0], head)
  const eyes = [-0.13, 0.13].map((x, index) => {
    const eye = joint(index === 0 ? 'RightEye' : 'LeftEye', [x, 0.12, 0.2], head)
    const iris = joint(`${eye.name}Iris`, [0, 0, 0], eye)
    return { group: eye, iris, position: eye.position.clone() }
  })
  const mouth = joint('Mouth', [0, -0.14, 0.2], head)
  const teeth = joint('Teeth', [0, -0.13, 0.2], head)

  // One skinned mesh means one hit target, so head and hand clicks would all
  // read as "body". An invisible collider, slightly larger than the head so it
  // is struck before the skin, restores the head interaction.
  model.updateMatrixWorld(true)
  const headCollider = (() => {
    const geometry = new THREE.SphereGeometry(0.15, 12, 10)
    const probe = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ visible: false }))
    probe.name = 'headCollider'
    probe.userData.hit = 'head'
    head.add(probe)
    // centre is in the source model's own space (feet at y=0, height ~0.96)
    probe.position.copy(head.worldToLocal(model.localToWorld(new THREE.Vector3(0.01, 0.83, -0.01))))
    geometries.add(geometry)
    materials.add(probe.material as THREE.Material)
    return probe
  })()

  // arms[0] / legs[0] are the subject's right, matching createMascot.
  const arms = [
    {
      shoulder: bone('R_Upperarm', [-0.48, 2.86, 0]),
      elbow: bone('R_Forearm', [-1.05, 2.86, 0]),
      hand: bone('R_Hand', [-1.62, 2.86, 0]),
    },
    {
      shoulder: bone('L_Upperarm', [0.48, 2.86, 0]),
      elbow: bone('L_Forearm', [1.05, 2.86, 0]),
      hand: bone('L_Hand', [1.62, 2.86, 0]),
    },
  ]
  const legs = [
    { hip: bone('R_Thigh', [-0.18, 1.75, 0]), knee: bone('R_Calf', [-0.18, 0.9, 0]) },
    { hip: bone('L_Thigh', [0.18, 1.75, 0]), knee: bone('L_Calf', [0.18, 0.9, 0]) },
  ]

  const motion = createMascotMotion(model, root)
  if (hands) {
    const update = motion.update
    motion.update = (dt, input) => {
      const result = update(dt, input)
      hands.update(motion.state.pose, input.reducedMotion)
      return result
    }
  }
  const hitTargets: THREE.Object3D[] = [headCollider]
  for (const arm of arms) {
    const geometry = new THREE.SphereGeometry(0.06, 10, 8)
    const material = new THREE.MeshBasicMaterial({ visible: false })
    const probe = new THREE.Mesh(geometry, material)
    probe.userData.hit = 'hand'
    arm.hand.add(probe)
    hitTargets.push(probe)
    geometries.add(geometry)
    materials.add(material)
  }
  const bodyCollider = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.5, 1.15, 4, 8),
    new THREE.MeshBasicMaterial({ visible: false }),
  )
  bodyCollider.position.set(0, 2.05, 0)
  bodyCollider.userData.hit = 'body'
  root.add(bodyCollider)
  hitTargets.push(bodyCollider)
  geometries.add(bodyCollider.geometry)
  materials.add(bodyCollider.material)

  return {
    root,
    body,
    head,
    face,
    eyes,
    arms,
    legs,
    mouth,
    teeth,
    setWireframe(enabled: boolean) {
      surfaceMaterials.forEach((original, object) => {
        object.material = enabled ? digitalMaterial : original
      })
    },
    triangles: [...geometries].reduce(
      (sum, geometry) =>
        sum + (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3,
      0,
    ),
    updateFace() {},
    motion,
    hitTargets,
    dispose() {
      geometries.forEach((geometry) => geometry.dispose())
      materials.forEach((material) => material.dispose())
      textures.forEach((texture) => texture.dispose())
      skeletons.forEach((skeleton) => skeleton.dispose())
      digitalMaterial.dispose()
    },
  }
}
