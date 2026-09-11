import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  createGeneratedMascot,
  createNeutralMascot,
  type MascotAction,
  type MascotMood,
  type MascotRig,
} from './rig'
import generatedMascotSource from '../assets/mascot/charaf-studio.glb?url'
import handSource from '../assets/mascot/studio-hand.glb?url'

export type StageAction = { name: MascotAction; id: number }
export type StageState = {
  entered: boolean
  mood: MascotMood
  action: StageAction
  wireframe: boolean
  onInteraction: (target: string) => void
}

type StageStateRef = { current: StageState }

const ease = (value: number) => 1 - Math.pow(1 - THREE.MathUtils.clamp(value, 0, 1), 3)

export function createStage(host: HTMLDivElement, state: StageStateRef, onReady: () => void) {
  let disposed = false
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    })
  } catch {
    host.dataset.fallback = 'empty'
    host.dataset.ready = 'true'
    onReady()
    return
  }
  const compactDevice = matchMedia('(max-width: 900px)').matches
  renderer.setPixelRatio(Math.min(devicePixelRatio, compactDevice ? 1.5 : 1.75))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.03
  renderer.outputColorSpace = THREE.SRGBColorSpace
  host.appendChild(renderer.domElement)
  renderer.domElement.setAttribute(
    'aria-label',
    'Charaf, a generated three-dimensional cartoon mascot. Drag to orbit. Select the character to interact.',
  )
  renderer.domElement.setAttribute('role', 'img')
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xeeefea)
  scene.fog = new THREE.Fog(0xeeefea, 15, 40)
  const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 80)
  camera.position.set(0, 3.23, 5.3)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 3, 0)
  controls.enableDamping = true
  controls.dampingFactor = 0.07
  controls.enablePan = false
  controls.enableZoom = false
  controls.minPolarAngle = 1.03
  controls.maxPolarAngle = 1.72
  controls.rotateSpeed = 0.55
  controls.enabled = false
  const resources: Array<{ dispose: () => void }> = []
  const pmrem = new THREE.PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  const environment = pmrem.fromScene(room, 0.04)
  scene.environment = environment.texture
  scene.environmentIntensity = 0.45
  resources.push(environment)
  room.dispose()
  pmrem.dispose()
  scene.add(new THREE.HemisphereLight(0xffffff, 0xc5b99b, 1.15))
  const key = new THREE.DirectionalLight(0xfff8ed, 2.35)
  key.position.set(-3.5, 7, 5)
  key.castShadow = true
  key.shadow.mapSize.setScalar(compactDevice ? 1024 : 2048)
  key.shadow.camera.left = -5
  key.shadow.camera.right = 5
  key.shadow.camera.top = 7
  key.shadow.camera.bottom = -4
  key.shadow.normalBias = 0.028
  key.shadow.bias = -0.0002
  key.shadow.radius = 4
  scene.add(key)
  const rim = new THREE.DirectionalLight(0xd7e1ff, 1.4)
  rim.position.set(4, 4, -2)
  scene.add(rim)
  const bounce = new THREE.DirectionalLight(0xffd6bd, 0.65)
  bounce.position.set(1, 2, 4)
  scene.add(bounce)

  const standard = (color: number, roughness = 0.7, metalness = 0) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness, metalness })
    resources.push(material)
    return material
  }
  const addMesh = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    parent: THREE.Object3D = scene,
  ) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    resources.push(geometry)
    return mesh
  }
  const floorMaterial = new THREE.ShadowMaterial({ color: 0x586447, opacity: 0.16 })
  resources.push(floorMaterial)
  const floor = addMesh(new THREE.PlaneGeometry(100, 100), floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.16
  floor.castShadow = false
  const platform = addMesh(
    new THREE.CylinderGeometry(1.48, 1.51, 0.13, 96),
    standard(0xb9ce80, 0.85),
  )
  platform.position.set(0, -0.084, 0)
  const platformEdge = addMesh(
    new THREE.TorusGeometry(1.465, 0.012, 8, 100),
    standard(0xc0ce9a, 0.35, 0.3),
  )
  platformEdge.rotation.x = Math.PI / 2
  platformEdge.position.y = -0.013

  const laptop = new THREE.Group()
  laptop.name = 'ProjectLaptop'
  laptop.position.set(-1.51, 1.35, 0.28)
  laptop.rotation.set(0.08, 0.35, -0.09)
  laptop.userData.hit = 'laptop'
  scene.add(laptop)
  const laptopMat = standard(0xb9bfba, 0.34, 0.7)
  addMesh(new RoundedBoxGeometry(0.9, 0.054, 0.6, 3, 0.025), laptopMat, laptop)
  const keyboard = addMesh(
    new RoundedBoxGeometry(0.7, 0.014, 0.3, 2, 0.018),
    standard(0x323936),
    laptop,
  )
  keyboard.position.set(0, 0.035, -0.045)
  const screenHinge = new THREE.Group()
  screenHinge.position.set(0, 0.015, -0.28)
  screenHinge.rotation.x = -0.16
  laptop.add(screenHinge)
  const lid = addMesh(new RoundedBoxGeometry(0.91, 0.59, 0.039, 3, 0.023), laptopMat, screenHinge)
  lid.position.y = 0.29
  const screenCanvas = document.createElement('canvas')
  screenCanvas.width = 512
  screenCanvas.height = 320
  const screenContext = screenCanvas.getContext('2d')!
  const screenTexture = new THREE.CanvasTexture(screenCanvas)
  screenTexture.colorSpace = THREE.SRGBColorSpace
  resources.push(screenTexture)
  const screenMaterial = new THREE.MeshBasicMaterial({ map: screenTexture })
  resources.push(screenMaterial)
  const screen = addMesh(new THREE.PlaneGeometry(0.83, 0.5), screenMaterial, screenHinge)
  screen.position.set(0, 0.29, 0.023)
  let screenVersion = ''
  const drawScreen = (text: string) => {
    screenContext.fillStyle = '#1c2725'
    screenContext.fillRect(0, 0, 512, 320)
    screenContext.fillStyle = '#ccf19a'
    screenContext.font = '24px monospace'
    screenContext.fillText('charaf.py', 27, 43)
    screenContext.fillStyle = '#66796c'
    screenContext.fillRect(26, 63, 460, 1)
    screenContext.fillStyle = '#eeefe5'
    screenContext.font = '19px monospace'
    screenContext.fillText('class DigitalTwin:', 27, 103)
    screenContext.fillStyle = '#c5dda7'
    screenContext.fillText(`  state = "${text}"`, 27, 145)
    screenContext.fillStyle = '#dc9b8e'
    screenContext.fillText('  curiosity = float("inf")', 27, 187)
    screenContext.fillStyle = '#9caba6'
    screenContext.fillText('  human_at_heart = True', 27, 229)
    screenContext.fillStyle = '#ccf19a'
    screenContext.fillText('> hello, world_', 27, 284)
    screenTexture.needsUpdate = true
  }
  drawScreen('online')

  const toy = new THREE.Group()
  toy.position.set(1.35, 0.48, 0.48)
  toy.rotation.set(0.2, 0.5, 0.12)
  toy.userData.hit = 'toy'
  scene.add(toy)
  const cube = addMesh(
    new RoundedBoxGeometry(0.36, 0.36, 0.36, 4, 0.075),
    standard(0xf87962, 0.43),
    toy,
  )
  for (const [x, y] of [
    [-0.075, 0.075],
    [0.075, 0.075],
    [0, 0],
    [-0.075, -0.075],
    [0.075, -0.075],
  ]) {
    const dot = addMesh(new THREE.SphereGeometry(0.026, 12, 8), standard(0xfff5e6), toy)
    dot.position.set(x, y, 0.177)
  }
  cube.userData.hit = 'toy'

  const confettiGeometry = new THREE.BoxGeometry(0.065, 0.1, 0.012)
  const confettiMaterial = standard(0xffffff, 0.8)
  const confetti = new THREE.InstancedMesh(confettiGeometry, confettiMaterial, 64)
  const confettiTransform = new THREE.Object3D()
  for (let i = 0; i < 64; i++)
    confetti.setColorAt(i, new THREE.Color([0x365beb, 0xe4755e, 0xc1d47d, 0xf4c458][i % 4]))
  confetti.visible = false
  confetti.frustumCulled = false
  scene.add(confetti)
  resources.push(confettiGeometry)

  let rig: MascotRig | null = null
  const mountRig = (nextRig: MascotRig, source: 'animated' | 'neutral') => {
    if (disposed) {
      nextRig.dispose()
      return
    }
    rig = nextRig
    scene.add(nextRig.root)
    renderer.compile(scene, camera)
    delete host.dataset.fallback
    host.dataset.asset = source
    host.dataset.ready = 'true'
    host.dataset.meshTriangles = String(nextRig.triangles)
    onReady()
  }
  const mountEmptyStage = () => {
    if (disposed) return
    host.dataset.fallback = 'empty'
    host.dataset.ready = 'true'
    delete host.dataset.asset
    onReady()
  }
  const loader = new GLTFLoader()
  loader
    .loadAsync(generatedMascotSource)
    .then(async (gltf) => {
      try {
        if (
          import.meta.env.DEV &&
          new URLSearchParams(window.location.search).get('mascot') === 'neutral'
        )
          throw new Error('Neutral mascot requested for development')
        const hands = await loader.loadAsync(handSource)
        mountRig(createGeneratedMascot(gltf.scene, hands.scene), 'animated')
      } catch {
        mountRig(createNeutralMascot(gltf.scene), 'neutral')
      }
    })
    .catch(mountEmptyStage)

  const pointer = new THREE.Vector2()
  const bubbleAnchor = new THREE.Vector3()
  const studio = host.closest('.twin-studio') as HTMLElement | null
  const gaze = new THREE.Vector2()
  const raycaster = new THREE.Raycaster()
  let pointerDown = { x: 0, y: 0 }
  let pointerInside = false
  let interacting = false
  let previousAction = state.current.action.id
  let currentAction: MascotAction = 'wave'
  let actionAt = -10
  let enteredAt = -1
  let elapsed = 0
  let lastTime = 0
  let frame = 0
  let wireframeActive = false
  let welcomePlayed = false
  let hoverAt = 0
  let width = 1,
    height = 1
  let framing = 0
  let cameraDistance = 10.6
  let resetAt = -1
  const resetOrbit = new THREE.Spherical()
  const resetTarget = new THREE.Vector3()
  const cameraOffset = new THREE.Vector3()
  const resetSpherical = new THREE.Spherical()
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  const resize = () => {
    width = host.clientWidth
    height = host.clientHeight
    if (!width || !height) return
    camera.aspect = width / height
    const mobile = window.innerWidth <= 900
    cameraDistance = mobile ? (window.innerHeight <= 720 ? 9.8 : 11.2) : 10.6
    camera.setViewOffset(
      width,
      height,
      mobile ? 0 : width * THREE.MathUtils.lerp(-0.16, 0.13, framing),
      0,
      width,
      height,
    )
    camera.updateProjectionMatrix()
    renderer.setSize(width, height)
    // Resizing clears the drawing buffer. Redraw immediately so the camera
    // reveal and responsive CSS transition never flash an empty canvas.
    renderer.render(scene, camera)
  }
  const observer = new ResizeObserver(resize)
  observer.observe(host)
  resize()
  const onPointerMove = (event: PointerEvent) => {
    const bounds = renderer.domElement.getBoundingClientRect()
    pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      (-(event.clientY - bounds.top) / bounds.height) * 2 + 1,
    )
    pointerInside =
      event.clientX >= bounds.left &&
      event.clientX <= bounds.right &&
      event.clientY >= bounds.top &&
      event.clientY <= bounds.bottom
    gaze.set(
      THREE.MathUtils.clamp((event.clientX / window.innerWidth - 0.4) * 2, -1, 1),
      THREE.MathUtils.clamp(0.5 - event.clientY / window.innerHeight, -0.7, 0.7),
    )
  }
  const onPointerDown = (event: PointerEvent) => {
    resetAt = -1
    controls.enableDamping = true
    pointerDown = { x: event.clientX, y: event.clientY }
    onPointerMove(event)
  }
  const onPointerUp = (event: PointerEvent) => {
    if (Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 7 || !rig) return
    onPointerMove(event)
    scene.updateMatrixWorld(true)
    raycaster.setFromCamera(pointer, camera)
    const hit = raycaster.intersectObjects([...rig.hitTargets, laptop, toy], true)[0]
    if (!hit) return
    let object: THREE.Object3D | null = hit.object
    while (object && !object.userData.hit) object = object.parent
    state.current.onInteraction(object?.userData.hit ?? 'body')
  }
  const onPointerLeave = () => {
    pointerInside = false
    renderer.domElement.style.cursor = 'grab'
    gaze.set(0, 0)
  }
  const orbitStart = () => {
    interacting = true
  }
  const orbitEnd = () => {
    interacting = false
  }
  controls.addEventListener('start', orbitStart)
  controls.addEventListener('end', orbitEnd)
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  renderer.domElement.addEventListener('pointerup', onPointerUp)
  renderer.domElement.addEventListener('pointerleave', onPointerLeave)
  const onLost = (event: Event) => {
    event.preventDefault()
    cancelAnimationFrame(frame)
    rig?.dispose()
    rig = null
    renderer.domElement.remove()
    host.dataset.fallback = 'empty'
    host.dataset.ready = 'true'
    delete host.dataset.asset
    onReady()
  }
  renderer.domElement.addEventListener('webglcontextlost', onLost)

  const animate = (now: number) => {
    frame = requestAnimationFrame(animate)
    const dt = Math.min((now - lastTime) / 1000, 0.05)
    lastTime = now
    if (document.hidden) return
    elapsed += dt
    const reduced = reducedMotion.matches
    const time = reduced ? 0 : elapsed
    const mobile = window.innerWidth <= 900
    if (state.current.entered && enteredAt < 0) {
      enteredAt = elapsed
      actionAt = elapsed + 1
      currentAction = 'wave'
    }
    const entrance = enteredAt < 0 ? 0 : ease((elapsed - enteredAt) / (reduced ? 0.01 : 2))
    const framingChanged = framing !== entrance
    if (framingChanged) {
      framing = entrance
      camera.setViewOffset(
        width,
        height,
        mobile ? 0 : width * THREE.MathUtils.lerp(-0.16, 0.13, framing),
        0,
        width,
        height,
      )
    }
    if (entrance < 1 || framingChanged) {
      camera.position.set(
        0,
        THREE.MathUtils.lerp(3.23, mobile ? 3.4 : 3.1, entrance),
        THREE.MathUtils.lerp(5.3, cameraDistance, entrance),
      )
      controls.target.set(0, THREE.MathUtils.lerp(3, 2.05, entrance), 0)
    }
    controls.enabled = entrance >= 1
    if (state.current.action.id !== previousAction) {
      previousAction = state.current.action.id
      currentAction = state.current.action.name
      actionAt = elapsed
      rig?.motion?.perform(currentAction)
      if (currentAction === 'reset') {
        controls.enableDamping = false
        controls.update()
        resetOrbit.setFromVector3(cameraOffset.copy(camera.position).sub(controls.target))
        resetTarget.copy(controls.target)
        resetAt = elapsed
      }
    }
    if (resetAt >= 0) {
      const t = reduced ? 1 : THREE.MathUtils.smootherstep((elapsed - resetAt) / 0.85, 0, 1)
      const elevation = (mobile ? 3.4 : 3.1) - 2.05
      resetSpherical.set(
        THREE.MathUtils.lerp(resetOrbit.radius, Math.hypot(cameraDistance, elevation), t),
        THREE.MathUtils.lerp(resetOrbit.phi, Math.atan2(cameraDistance, elevation), t),
        resetOrbit.theta * (1 - t),
      )
      controls.target.copy(resetTarget).lerp(cameraOffset.set(0, 2.05, 0), t)
      camera.position.setFromSpherical(resetSpherical).add(controls.target)
      if (t === 1) {
        resetAt = -1
        controls.enableDamping = true
      }
    }

    const actionTime = elapsed - actionAt
    const actionActive =
      actionTime >= 0 &&
      actionTime < (currentAction === 'dance' ? 5 : currentAction === 'wave' ? 3.2 : 2)
    if (rig) {
      if (state.current.wireframe !== wireframeActive) {
        wireframeActive = state.current.wireframe
        rig.setWireframe(wireframeActive)
        host.dataset.wireframe = String(wireframeActive)
      }
      if (rig.motion) {
        if (!welcomePlayed && enteredAt >= 0 && elapsed - enteredAt >= 1.5) {
          welcomePlayed = true
          if (state.current.action.id === 0 && !reduced) rig.motion.perform('wave')
        }
        const motion = rig.motion.update(dt, {
          mood: state.current.mood,
          gaze,
          reducedMotion: reduced,
          interacting,
        })
        host.dataset.action = motion.action
        host.dataset.motion = reduced ? 'reduced' : 'authored'
        host.dataset.progress = motion.progress.toFixed(3)
      } else {
        host.dataset.action = 'idle'
        host.dataset.motion = 'neutral'
        host.dataset.progress = '0.000'
      }

      host.dataset.mood = state.current.mood
      // Hit proxies follow the joints and avoid CPU skinning 19k triangles
      // on every pointer frame. Throttle hover work; clicks remain immediate.
      if (pointerInside && !interacting && entrance >= 1 && elapsed - hoverAt > 0.08) {
        hoverAt = elapsed
        scene.updateMatrixWorld(true)
        raycaster.setFromCamera(pointer, camera)
        const hits = raycaster.intersectObjects([...rig.hitTargets, laptop, toy], true)
        renderer.domElement.style.cursor = hits.length ? 'pointer' : 'grab'
      }
    }
    confetti.visible =
      !reduced && actionActive && (currentAction === 'dance' || currentAction === 'jump')
    if (confetti.visible) {
      for (let i = 0; i < 64; i++) {
        const age = (actionTime + (i % 7) * 0.12) % 2.2
        const angle = i * 2.399963
        const speed = 0.35 + (i % 11) * 0.085
        confettiTransform.position.set(
          Math.cos(angle) * age * speed,
          1.6 + age * (1.4 + (i % 9) * 0.14) - age * age * 1.3,
          Math.sin(angle) * age * speed + 0.3,
        )
        confettiTransform.rotation.set(age * ((i % 5) + 1), angle + age * 2, age * ((i % 4) + 1))
        confettiTransform.scale.setScalar(Math.min(1, age * 6) * Math.max(0, 1 - age / 2.2))
        confettiTransform.updateMatrix()
        confetti.setMatrixAt(i, confettiTransform.matrix)
      }
      confetti.instanceMatrix.needsUpdate = true
    }
    if (state.current.mood !== screenVersion) {
      screenVersion = state.current.mood
      drawScreen(screenVersion)
    }
    laptop.position.y = 1.3 + Math.sin(time * 1.2) * 0.07
    laptop.rotation.z = -0.09 + Math.sin(time * 0.9) * 0.025
    toy.position.y = 0.48 + Math.sin(time * 1.4) * 0.045
    toy.rotation.y = 0.5 + time * 0.15
    laptop.scale.setScalar(0.92 * entrance)
    toy.scale.setScalar(entrance)
    controls.update()
    renderer.render(scene, camera)
    if (rig && studio && state.current.entered) {
      rig.head.getWorldPosition(bubbleAnchor)
      bubbleAnchor.x += 0.62
      bubbleAnchor.y += 0.65
      bubbleAnchor.project(camera)
      const bounds = host.getBoundingClientRect()
      const x = Math.min(
        window.innerWidth - (mobile ? 134 : 190),
        (bubbleAnchor.x * 0.5 + 0.5) * width + bounds.left + 8,
      )
      const y = Math.max(
        mobile ? 76 : 115,
        (-bubbleAnchor.y * 0.5 + 0.5) * height + bounds.top - 25,
      )
      studio.style.setProperty('--bubble-x', `${x.toFixed(1)}px`)
      studio.style.setProperty('--bubble-y', `${y.toFixed(1)}px`)
    }
  }
  frame = requestAnimationFrame(animate)
  return () => {
    disposed = true
    cancelAnimationFrame(frame)
    observer.disconnect()
    window.removeEventListener('pointermove', onPointerMove)
    renderer.domElement.removeEventListener('pointerdown', onPointerDown)
    renderer.domElement.removeEventListener('pointerup', onPointerUp)
    renderer.domElement.removeEventListener('pointerleave', onPointerLeave)
    renderer.domElement.removeEventListener('webglcontextlost', onLost)
    controls.dispose()
    rig?.dispose()
    confetti.dispose()
    resources.forEach((resource) => resource.dispose())
    key.shadow.map?.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
    renderer.domElement.remove()
  }
}
