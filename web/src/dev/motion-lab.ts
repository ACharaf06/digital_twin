// Development-only clip scrubber. Vite builds only the studio entry point.
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { createGeneratedMascot } from '../lib/mascot'
import source from '../../../assets/3d/charaf-animated.glb?url'
import handSource from '../../../assets/3d/studio-hand.glb?url'
import studioSource from '../../../assets/3d/charaf-studio.glb?url'
import tshapeSource from '../../../assets/3d/charaf_light_Tshape.glb?url'
import normalSource from '../../../assets/3d/charaf_light_normalshape.glb?url'
import segmentedSource from '../../../assets/3d/charaf_segmented.glb?url'
import draftSource from '../../../assets/3d/draft/charaf-tripo-hd-original.glb?url'
const variants: Record<string, string> = {
  tshape: tshapeSource,
  normal: normalSource,
  segmented: segmentedSource,
  draft: draftSource,
}

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
renderer.setSize(innerWidth, innerHeight)
renderer.setPixelRatio(1)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.03
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.body.append(renderer.domElement)
const scene = new THREE.Scene()
scene.background = new THREE.Color(0xeeefea)
const room = new RoomEnvironment()
const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(room, 0.04).texture
scene.environmentIntensity = 0.45
room.dispose()
pmrem.dispose()
scene.add(new THREE.HemisphereLight(0xffffff, 0xc5b99b, 1.15))
const light = new THREE.DirectionalLight(0xfff8ed, 2.35)
light.position.set(-3.5, 7, 5)
scene.add(light)
const camera = new THREE.PerspectiveCamera(33, innerWidth / innerHeight, 0.1, 80)
camera.position.set(0, 2.6, 9)
const orbit = new OrbitControls(camera, renderer.domElement)
orbit.target.set(0, 2, 0)
orbit.update()
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(1.5, 64),
  new THREE.MeshStandardMaterial({ color: 0xb9ce80, roughness: 0.85 }),
)
floor.rotation.x = -Math.PI / 2
floor.position.y = -0.01
scene.add(floor)
const params = new URLSearchParams(location.search)
const authored = params.has('authored')
const gltf = await new GLTFLoader().loadAsync(
  variants[params.get('asset') ?? ''] ?? (authored ? studioSource : source),
)
const model = gltf.scene
const handTemplate =
  authored && params.get('hands') !== 'original'
    ? await new GLTFLoader().loadAsync(handSource)
    : null
const rig = authored ? createGeneratedMascot(model, handTemplate?.scene) : null
const bounds = new THREE.Box3().setFromObject(model)
const scale = authored ? 1 : 4 / bounds.getSize(new THREE.Vector3()).y
if (!authored) {
  model.scale.setScalar(scale)
  model.position.y = -bounds.min.y * scale
}
scene.add(rig?.root ?? model)
const mixer = new THREE.AnimationMixer(model)
let action: THREE.AnimationAction | undefined
let playing = false
let cursor = 0
let clipDuration = 8.4
const select = document.querySelector<HTMLSelectElement>('#clip')!
const view = document.querySelector<HTMLSelectElement>('#view')!
const slider = document.querySelector<HTMLInputElement>('#time')!
const readout = document.querySelector<HTMLOutputElement>('#readout')!
const input = {
  mood: 'idle' as const,
  gaze: new THREE.Vector2(),
  reducedMotion: false,
  interacting: false,
}
const durations: Record<string, number> = {
  idle: 8.4,
  wave: 3.5,
  dance: 4.6,
  jump: 1.8,
  present: 3.4,
  spin: 2.6,
}
const aliases: Record<string, string> = { greet_01: 'wave', dance_02: 'dance', cheer: 'present' }
if (authored) for (const name of Object.keys(durations)) select.add(new Option(name, name))
else
  for (const clip of gltf.animations) select.add(new Option(clip.name.split(':').pop(), clip.name))
function joints() {
  model.updateWorldMatrix(true, true)
  return ['Head', 'Hip', 'L_Foot', 'R_Foot', 'L_ToeBase', 'R_ToeBase', 'L_Hand', 'R_Hand'].map(
    (name) => ({
      name,
      position: model.getObjectByName(name)?.getWorldPosition(new THREE.Vector3()).toArray() ?? [
        0, 0, 0,
      ],
    }),
  )
}
function readTime() {
  slider.max = String(clipDuration)
  slider.value = String(cursor)
  readout.value = cursor.toFixed(2) + ' / ' + clipDuration.toFixed(2) + ' s'
}
function sample(name: string, time: number) {
  cursor = time
  if (rig?.motion) {
    const short = name.split(':').pop()!
    const motionName = aliases[short] ?? short
    clipDuration = durations[motionName] ?? 8.4
    rig.motion.update(0, { ...input, reducedMotion: true })
    rig.motion.perform(
      motionName === 'idle' ? 'reset' : (motionName as Parameters<typeof rig.motion.perform>[0]),
    )
    for (let t = 0; t < time - 1e-8;) {
      const dt = Math.min(1 / 120, time - t)
      rig.motion.update(dt, input)
      t += dt
    }
  } else {
    const clip = gltf.animations.find((c) => c.name === name || c.name.endsWith(':' + name))!
    if (!clip) return []
    clipDuration = clip.duration
    mixer.stopAllAction()
    action = mixer.clipAction(clip).reset().setLoop(THREE.LoopOnce, 1).play()
    action.clampWhenFinished = true
    action.time = time
    mixer.update(0)
  }
  const result = joints()
  readTime()
  renderer.render(scene, camera)
  return result
}
select.onchange = () => sample(select.value, 0)
slider.oninput = () => {
  playing = false
  sample(select.value, Number(slider.value))
}
document.querySelector<HTMLButtonElement>('#play')!.onclick = () => {
  playing = !playing
}
view.onchange = () => {
  if (view.value === 'profile') {
    orbit.target.set(-0.5, 2.65, 0.05)
    camera.position.set(-5.2, 2.65, 0.05)
  } else {
    orbit.target.set(0, 2, 0)
    camera.position.set(view.value === 'three-quarter' ? -5.5 : 0, 2.6, 9)
  }
  orbit.update()
  renderer.render(scene, camera)
}
if ([...select.options].some((option) => option.value === params.get('clip')))
  select.value = params.get('clip')!
if ([...view.options].some((option) => option.value === params.get('view'))) {
  view.value = params.get('view')!
  view.dispatchEvent(new Event('change'))
}
sample(select.value, 0)
playing = params.has('play') && !matchMedia('(prefers-reduced-motion: reduce)').matches
const clock = new THREE.Clock()
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05)
  if (playing) {
    cursor += dt
    if (cursor > clipDuration) sample(select.value, 0)
    else if (rig?.motion) rig.motion.update(dt, input)
    else if (action) mixer.update(dt)
    readTime()
  }
  orbit.update()
  renderer.render(scene, camera)
})
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})
const lab = { sample, joints, model, scene, renderer, camera, orbit, gltf, rig, input, THREE }
export type MotionLab = typeof lab
declare global {
  interface Window {
    motionLab: MotionLab
    __ready: boolean
  }
}
Object.assign(window, { motionLab: lab, __ready: true })
