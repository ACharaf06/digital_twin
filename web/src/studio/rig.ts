import * as THREE from 'three'
import { attachStudioHands } from './hands'
import { createMascotMotion, type MascotMotion } from './motion'

export type { MascotAction, MascotMood } from './motion'

export type MascotRig = {
  root: THREE.Group
  head: THREE.Object3D
  setWireframe: (enabled: boolean) => void
  triangles: number
  dispose: () => void
  motion: MascotMotion | null
  hitTargets: THREE.Object3D[]
}

type SurfaceResources = {
  geometries: Set<THREE.BufferGeometry>
  materials: Set<THREE.Material>
  textures: Set<THREE.Texture>
  skeletons: Set<THREE.Skeleton>
  originals: Map<THREE.Mesh, THREE.Material | THREE.Material[]>
}

function normalizeModel(model: THREE.Group, root: THREE.Group) {
  const sourceBounds = new THREE.Box3().setFromObject(model)
  const sourceSize = sourceBounds.getSize(new THREE.Vector3())
  model.scale.multiplyScalar(sourceSize.y > 0 ? 4 / sourceSize.y : 1)
  model.updateMatrixWorld(true)

  const bounds = new THREE.Box3().setFromObject(model)
  const center = bounds.getCenter(new THREE.Vector3())
  model.position.x -= center.x
  model.position.y -= bounds.min.y
  model.position.z -= center.z
  model.updateMatrixWorld(true)
  root.add(model)
}

function collectSurfaceResources(model: THREE.Object3D): SurfaceResources {
  const resources: SurfaceResources = {
    geometries: new Set(),
    materials: new Set(),
    textures: new Set(),
    skeletons: new Set(),
    originals: new Map(),
  }

  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.castShadow = true
    object.receiveShadow = true
    object.userData.hit = 'body'
    if (object instanceof THREE.SkinnedMesh) {
      object.frustumCulled = false
      resources.skeletons.add(object.skeleton)
    }
    resources.geometries.add(object.geometry)
    resources.originals.set(object, object.material)
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    materials.forEach((material) => {
      resources.materials.add(material)
      Object.values(material).forEach((value) => {
        if (value instanceof THREE.Texture) resources.textures.add(value)
      })
    })
  })

  return resources
}

function createSurfaceController(resources: SurfaceResources) {
  const digitalMaterial = new THREE.MeshBasicMaterial({
    color: 0x365beb,
    wireframe: true,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  })

  return {
    triangles: [...resources.geometries].reduce(
      (sum, geometry) =>
        sum + (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3,
      0,
    ),
    setWireframe(enabled: boolean) {
      resources.originals.forEach((original, object) => {
        object.material = enabled ? digitalMaterial : original
      })
    },
    dispose() {
      resources.geometries.forEach((geometry) => geometry.dispose())
      resources.materials.forEach((material) => material.dispose())
      resources.textures.forEach((texture) => texture.dispose())
      resources.skeletons.forEach((skeleton) => skeleton.dispose())
      digitalMaterial.dispose()
    },
  }
}

/**
 * Keep the authored GLB visible when its hand or motion setup cannot start.
 * This deliberately has no alternate animation system: it is the same model,
 * held in its exported neutral pose.
 */
export function createNeutralMascot(model: THREE.Group): MascotRig {
  const root = new THREE.Group()
  root.name = 'CharafNeutral'
  normalizeModel(model, root)
  const resources = collectSurfaceResources(model)
  const surface = createSurfaceController(resources)
  const head = model.getObjectByName('Head') ?? model

  return {
    root,
    head,
    ...surface,
    motion: null,
    hitTargets: [model],
  }
}

/** Wrap the authored GLB with its skeleton-bound motion and hit targets. */
export function createGeneratedMascot(model: THREE.Group, handTemplate: THREE.Group): MascotRig {
  const root = new THREE.Group()
  root.name = 'CharafGenerated'
  normalizeModel(model, root)
  const hands = attachStudioHands(model, handTemplate)
  const resources = collectSurfaceResources(model)
  const surface = createSurfaceController(resources)

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

  const bones = new Map<string, THREE.Object3D>()
  model.traverse((object) => {
    if (object.name) bones.set(object.name, object)
  })
  const bone = (name: string, fallback: [number, number, number]) => {
    const found = bones.get(name)
    if (found) return found
    console.warn(`[mascot] bone "${name}" not found in the authored model`)
    return joint(`${name}Fallback`, fallback)
  }

  const head = bone('Head', [0, 3.42, 0])
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

  model.updateMatrixWorld(true)
  const headGeometry = new THREE.SphereGeometry(0.15, 12, 10)
  const headMaterial = new THREE.MeshBasicMaterial({ visible: false })
  const headCollider = new THREE.Mesh(headGeometry, headMaterial)
  headCollider.name = 'headCollider'
  headCollider.userData.hit = 'head'
  head.add(headCollider)
  headCollider.position.copy(
    head.worldToLocal(model.localToWorld(new THREE.Vector3(0.01, 0.83, -0.01))),
  )
  resources.geometries.add(headGeometry)
  resources.materials.add(headMaterial)

  const hitTargets: THREE.Object3D[] = [headCollider]
  for (const arm of arms) {
    const geometry = new THREE.SphereGeometry(0.06, 10, 8)
    const material = new THREE.MeshBasicMaterial({ visible: false })
    const probe = new THREE.Mesh(geometry, material)
    probe.userData.hit = 'hand'
    arm.hand.add(probe)
    hitTargets.push(probe)
    resources.geometries.add(geometry)
    resources.materials.add(material)
  }

  const bodyGeometry = new THREE.CapsuleGeometry(0.5, 1.15, 4, 8)
  const bodyMaterial = new THREE.MeshBasicMaterial({ visible: false })
  const bodyCollider = new THREE.Mesh(bodyGeometry, bodyMaterial)
  bodyCollider.position.set(0, 2.05, 0)
  bodyCollider.userData.hit = 'body'
  root.add(bodyCollider)
  hitTargets.push(bodyCollider)
  resources.geometries.add(bodyGeometry)
  resources.materials.add(bodyMaterial)

  const motion = createMascotMotion(model, root)
  const update = motion.update
  motion.update = (dt, input) => {
    const result = update(dt, input)
    hands.update(motion.state.pose, input.reducedMotion)
    return result
  }

  return {
    root,
    head,
    ...surface,
    motion,
    hitTargets,
  }
}
