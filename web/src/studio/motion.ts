import * as THREE from 'three'

// Authored procedural performances for the studio rig.

export type MascotMood = 'idle' | 'listening' | 'thinking' | 'speaking'
export type MascotAction = 'wave' | 'dance' | 'jump' | 'spin' | 'reset' | 'present'
export type MotionInput = {
  mood: MascotMood
  gaze: THREE.Vector2
  reducedMotion: boolean
  interacting: boolean
}

// All distances are in studio units (the character is four units tall).
// These are performance poses, not offsets in Tripo's arbitrary bone axes.
const neutral = {
  hipX: 0,
  hipY: -0.025,
  hipZ: 0,
  bodyPitch: 0,
  bodyYaw: 0,
  bodyRoll: 0,
  headPitch: 0,
  headYaw: 0,
  headRoll: 0,
  rightX: -0.64,
  rightY: 1.86,
  rightZ: 0.02,
  leftX: 0.58,
  leftY: 1.87,
  leftZ: 0.02,
  rightWave: 0,
  leftWave: 0,
  rightPresent: 0,
  leftPresent: 0,
  rightWrist: 0,
  leftWrist: 0,
  rightFootX: 0,
  rightFootY: 0,
  rightFootZ: 0,
  leftFootX: 0,
  leftFootY: 0,
  leftFootZ: 0,
  lift: 0,
  turn: 0,
}
type Pose = typeof neutral
type Key = keyof Pose
type Frame = [number, Partial<Pose>]
const keys = Object.keys(neutral) as Key[]
const smooth = (t: number) => THREE.MathUtils.smootherstep(t, 0, 1)
const mix = THREE.MathUtils.lerp
const radians = Math.PI / 180

const idle: Frame[] = [
  [0, {}],
  [2.8, { hipX: 0.018, hipY: -0.018, bodyPitch: -0.006, headRoll: -0.012, leftY: 1.88 }],
  [5.6, { hipX: -0.014, hipY: -0.028, bodyPitch: 0.003, headYaw: -0.025, rightY: 1.87 }],
  [8.4, {}],
]
const wave: Frame[] = [
  [0, {}],
  [
    0.32,
    { hipX: 0.035, bodyRoll: -0.015, rightX: -0.87, rightY: 2.12, rightZ: 0.15, headRoll: 0.03 },
  ],
  [
    1.0,
    {
      hipX: 0.025,
      rightX: -1.05,
      rightY: 3.15,
      rightZ: 0.19,
      rightWave: 1,
      rightWrist: -0.14,
      headRoll: 0.035,
    },
  ],
  [
    1.13,
    {
      hipX: 0.02,
      rightX: -1.08,
      rightY: 3.18,
      rightZ: 0.2,
      rightWave: 1,
      rightWrist: 0.25,
      headRoll: 0.02,
    },
  ],
  [
    1.43,
    {
      hipX: 0.02,
      rightX: -1.02,
      rightY: 3.15,
      rightZ: 0.2,
      rightWave: 1,
      rightWrist: -0.23,
      headRoll: 0.025,
    },
  ],
  [
    1.74,
    {
      hipX: 0.02,
      rightX: -1.08,
      rightY: 3.18,
      rightZ: 0.2,
      rightWave: 1,
      rightWrist: 0.23,
      headRoll: 0.02,
    },
  ],
  [
    2.04,
    {
      hipX: 0.02,
      rightX: -1.02,
      rightY: 3.15,
      rightZ: 0.2,
      rightWave: 1,
      rightWrist: -0.12,
      headRoll: 0.025,
    },
  ],
  [2.2, { rightX: -1.02, rightY: 3.06, rightZ: 0.19, rightWave: 1 }],
  [3.0, { rightX: -0.83, rightY: 2.24, rightZ: 0.16, rightWave: 0.25 }],
  [3.5, {}],
]
const present: Frame[] = [
  [0, {}],
  [
    0.55,
    {
      bodyYaw: -0.055,
      headYaw: -0.1,
      rightX: -0.84,
      rightY: 2.12,
      rightZ: 0.28,
      rightPresent: 0.55,
    },
  ],
  [
    1.15,
    {
      hipX: 0.025,
      bodyYaw: -0.065,
      headYaw: -0.13,
      rightX: -1.18,
      rightY: 2.24,
      rightZ: 0.28,
      rightPresent: 1,
    },
  ],
  [
    2.15,
    {
      hipX: 0.025,
      bodyYaw: -0.04,
      headYaw: 0.015,
      headRoll: 0.018,
      rightX: -1.15,
      rightY: 2.28,
      rightZ: 0.3,
      rightPresent: 1,
    },
  ],
  [2.8, { rightX: -0.91, rightY: 2.14, rightZ: 0.25, rightPresent: 0.6 }],
  [3.4, {}],
]
const jump: Frame[] = [
  [0, {}],
  [
    0.32,
    {
      hipY: -0.2,
      bodyPitch: 0.09,
      headPitch: -0.045,
      rightY: 1.9,
      leftY: 1.9,
      rightZ: -0.15,
      leftZ: -0.15,
    },
  ],
  [0.48, { hipY: -0.03, lift: 0.015, rightY: 2.28, leftY: 2.28, rightZ: 0.12, leftZ: 0.12 }],
  [
    0.78,
    {
      lift: 0.55,
      hipY: -0.05,
      rightFootY: 0.13,
      leftFootY: 0.13,
      rightFootZ: -0.06,
      leftFootZ: -0.06,
      rightY: 2.56,
      leftY: 2.56,
      rightX: -0.94,
      leftX: 0.9,
      rightZ: 0.12,
      leftZ: 0.12,
      headPitch: -0.03,
    },
  ],
  [1.07, { lift: 0.025, hipY: -0.015, rightY: 2.2, leftY: 2.2, rightZ: 0.13, leftZ: 0.13 }],
  [
    1.24,
    {
      hipY: -0.16,
      bodyPitch: 0.06,
      headPitch: 0.04,
      rightY: 1.9,
      leftY: 1.9,
      rightX: -0.78,
      leftX: 0.74,
    },
  ],
  [1.8, {}],
]
// Deliberate side steps. The support foot stays planted; only the free foot lifts.
const dance: Frame[] = [
  [0, {}],
  [0.4, { hipY: -0.1, rightY: 2.1, leftY: 2.1, rightZ: 0.2, leftZ: 0.2 }],
  [
    0.85,
    {
      hipX: -0.12,
      hipY: -0.07,
      bodyRoll: 0.035,
      leftFootY: 0.2,
      leftFootX: 0.16,
      rightY: 2.45,
      rightZ: 0.32,
      leftY: 2.12,
      leftZ: 0.22,
      headRoll: -0.035,
    },
  ],
  [
    1.3,
    {
      hipX: -0.06,
      hipY: -0.1,
      leftFootX: 0.16,
      rightY: 2.2,
      leftY: 2.2,
      rightZ: 0.25,
      leftZ: 0.25,
    },
  ],
  [
    1.75,
    {
      hipX: 0.14,
      hipY: -0.06,
      bodyRoll: -0.035,
      rightFootY: 0.2,
      rightFootX: -0.13,
      leftFootX: 0.16,
      leftY: 2.5,
      leftZ: 0.32,
      rightY: 2.12,
      rightZ: 0.22,
      headRoll: 0.035,
    },
  ],
  [
    2.2,
    {
      hipX: 0.06,
      hipY: -0.1,
      rightFootX: -0.13,
      leftFootX: 0.16,
      rightY: 2.2,
      leftY: 2.2,
      rightZ: 0.25,
      leftZ: 0.25,
    },
  ],
  [
    2.65,
    {
      hipX: -0.12,
      hipY: -0.07,
      bodyYaw: -0.07,
      bodyRoll: 0.035,
      rightFootX: -0.13,
      leftFootY: 0.23,
      leftFootZ: 0.08,
      leftY: 2.8,
      leftX: 1,
      leftZ: 0.16,
      leftWave: 0.7,
      rightY: 2.24,
      rightZ: 0.3,
    },
  ],
  [3.1, { hipY: -0.1, rightFootX: -0.13, rightY: 2.2, leftY: 2.2, rightZ: 0.25, leftZ: 0.25 }],
  [
    3.55,
    {
      hipX: 0.13,
      hipY: -0.06,
      bodyYaw: 0.07,
      bodyRoll: -0.035,
      rightFootY: 0.23,
      rightFootZ: 0.08,
      rightY: 2.8,
      rightX: -1.04,
      rightZ: 0.16,
      rightWave: 0.7,
      leftY: 2.24,
      leftZ: 0.3,
    },
  ],
  [4, { hipY: -0.1, rightY: 2.2, leftY: 2.2, rightZ: 0.25, leftZ: 0.25 }],
  [4.6, {}],
]
const performances = { wave, present, jump, dance }

function sample(frames: Frame[], time: number, flowing = false): Pose {
  const last = frames.length - 1
  let index = 0
  while (index < last - 1 && time > frames[index + 1][0]) index++
  const a = { ...neutral, ...frames[index][1] }
  const b = { ...neutral, ...frames[index + 1][1] }
  const duration = frames[index + 1][0] - frames[index][0]
  const t = THREE.MathUtils.clamp((time - frames[index][0]) / duration, 0, 1)
  for (const key of keys) {
    if (!flowing) {
      a[key] = mix(a[key], b[key], smooth(t))
      continue
    }
    // Monotone cubic tangents carry velocity through approach/return poses.
    // Easing each interval to a complete stop makes a greeting look mechanical.
    // Holds and direction reversals still have zero velocity, with no overshoot.
    const tangent = (at: number) => {
      if (at === 0 || at === frames.length - 1) return 0
      const before = frames[at - 1],
        current = frames[at],
        after = frames[at + 1]
      const leftTime = current[0] - before[0],
        rightTime = after[0] - current[0]
      const value = current[1][key] ?? neutral[key]
      const left = (value - (before[1][key] ?? neutral[key])) / leftTime
      const right = ((after[1][key] ?? neutral[key]) - value) / rightTime
      if (left * right <= 0) return 0
      const w1 = 2 * rightTime + leftTime,
        w2 = rightTime + 2 * leftTime
      return (w1 + w2) / (w1 / left + w2 / right)
    }
    a[key] =
      (2 * t ** 3 - 3 * t ** 2 + 1) * a[key] +
      (t ** 3 - 2 * t ** 2 + t) * duration * tangent(index) +
      (-2 * t ** 3 + 3 * t ** 2) * b[key] +
      (t ** 3 - t ** 2) * duration * tangent(index + 1)
  }
  return a
}

/** Two-bone IK in the character's normalized space, with an explicit bend plane.
 * Uses the imported rest transforms, including the skin's twist-bone branches. */
function createLimb(upper: THREE.Object3D, lower: THREE.Object3D, end: THREE.Object3D) {
  const origin = new THREE.Vector3(),
    middle = new THREE.Vector3(),
    tip = new THREE.Vector3()
  const direction = new THREE.Vector3(),
    poleDirection = new THREE.Vector3(),
    elbow = new THREE.Vector3()
  const from = new THREE.Vector3(),
    to = new THREE.Vector3()
  const delta = new THREE.Quaternion(),
    world = new THREE.Quaternion(),
    parent = new THREE.Quaternion()
  const lengthA = upper.getWorldPosition(origin).distanceTo(lower.getWorldPosition(middle))
  const lengthB = middle.distanceTo(end.getWorldPosition(tip))
  const aim = (joint: THREE.Object3D, child: THREE.Object3D, target: THREE.Vector3) => {
    joint.getWorldPosition(origin)
    from.copy(child.getWorldPosition(tip)).sub(origin).normalize()
    to.copy(target).sub(origin).normalize()
    delta.setFromUnitVectors(from, to)
    joint.getWorldQuaternion(world)
    joint.parent!.getWorldQuaternion(parent).invert()
    joint.quaternion.copy(parent.multiply(delta).multiply(world)).normalize()
    joint.updateWorldMatrix(false, true)
  }
  return (target: THREE.Vector3, pole: THREE.Vector3) => {
    upper.getWorldPosition(origin)
    direction.copy(target).sub(origin)
    const distance = THREE.MathUtils.clamp(
      direction.length(),
      Math.abs(lengthA - lengthB) + 0.001,
      lengthA + lengthB - 0.002,
    )
    direction.normalize()
    poleDirection
      .copy(pole)
      .sub(origin)
      .addScaledVector(direction, -poleDirection.dot(direction))
      .normalize()
    const along = (lengthA * lengthA - lengthB * lengthB + distance * distance) / (2 * distance)
    const height = Math.sqrt(Math.max(0, lengthA * lengthA - along * along))
    elbow.copy(origin).addScaledVector(direction, along).addScaledVector(poleDirection, height)
    aim(upper, lower, elbow)
    aim(lower, end, target)
  }
}

export function createMascotMotion(model: THREE.Group, root: THREE.Group) {
  model.updateWorldMatrix(true, true)
  const bone = (name: string) => {
    const found = model.getObjectByName(name)
    if (!found) throw new Error(`Mascot skeleton is missing ${name}`)
    return found
  }
  const rests: Array<{
    bone: THREE.Bone
    position: THREE.Vector3
    rotation: THREE.Quaternion
    scale: THREE.Vector3
  }> = []
  model.traverse((object) => {
    if (object instanceof THREE.Bone)
      rests.push({
        bone: object,
        position: object.position.clone(),
        rotation: object.quaternion.clone(),
        scale: object.scale.clone(),
      })
  })
  const hip = bone('Hip'),
    chest = bone('Spine01'),
    head = bone('Head')
  const hipPosition = root.worldToLocal(hip.getWorldPosition(new THREE.Vector3()))
  const restWorld = new Map(
    rests.map((r) => [r.bone.name, r.bone.getWorldQuaternion(new THREE.Quaternion())]),
  )
  const arms = ['R', 'L'].map((side, index) => {
    const hand = bone(`${side}_Hand`)
    const sign = index === 0 ? -1 : 1
    const frame = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(sign, 0, 0),
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, -sign),
    )
    const inverseFrame = new THREE.Quaternion().setFromRotationMatrix(frame).invert()
    const orientation = (finger: THREE.Vector3, palm: THREE.Vector3) => {
      finger.normalize()
      palm.addScaledVector(finger, -palm.dot(finger)).normalize()
      const cross = new THREE.Vector3().crossVectors(finger, palm)
      return new THREE.Quaternion()
        .setFromRotationMatrix(new THREE.Matrix4().makeBasis(finger, palm, cross))
        .multiply(inverseFrame)
        .multiply(restWorld.get(hand.name)!)
    }
    return {
      sign,
      hand,
      shoulder: bone(`${side}_Upperarm`),
      elbow: bone(`${side}_Forearm`),
      orientation,
      palmNormal: new THREE.Vector3(),
      previousDirection: new THREE.Vector3(),
      localPalm: new THREE.Vector3(0, -1, 0).applyQuaternion(
        restWorld.get(hand.name)!.clone().invert(),
      ),
      forearmTwists: [bone(`${side}_ForearmTwist01`), bone(`${side}_ForearmTwist02`)],
      solve: createLimb(bone(`${side}_Upperarm`), bone(`${side}_Forearm`), hand),
    }
  })
  const legs = ['R', 'L'].map((side) => {
    const foot = bone(`${side}_Foot`)
    return {
      foot,
      position: root.worldToLocal(foot.getWorldPosition(new THREE.Vector3())),
      orientation: foot.getWorldQuaternion(new THREE.Quaternion()),
      solve: createLimb(bone(`${side}_Thigh`), bone(`${side}_Calf`), foot),
    }
  })
  const target = new THREE.Vector3(),
    pole = new THREE.Vector3(),
    axis = new THREE.Vector3(0, 0, 1),
    bendDirection = new THREE.Vector3()
  const q = new THREE.Quaternion(),
    parentQ = new THREE.Quaternion(),
    rootQ = new THREE.Quaternion(),
    euler = new THREE.Euler(),
    wristQ = new THREE.Quaternion(),
    currentHandQ = new THREE.Quaternion(),
    forearmQ = new THREE.Quaternion(),
    rollQ = new THREE.Quaternion(),
    swingQ = new THREE.Quaternion(),
    inverseHandQ = new THREE.Quaternion(),
    identityQ = new THREE.Quaternion(),
    baseForearmQ = new THREE.Quaternion(),
    twistQ = new THREE.Quaternion(),
    fingerDirection = new THREE.Vector3(),
    palmDirection = new THREE.Vector3()
  let time = 0,
    actionTime = 0,
    active: MascotAction | 'idle' = 'idle'
  let pose = { ...neutral },
    previous = { ...neutral },
    velocity = { ...neutral }
  for (const key of keys) velocity[key] = 0
  let transition: { pose: Pose; velocity: Pose; at: number; duration: number } | null = null
  let lastDt = 1 / 60
  let lookX = 0,
    lookY = 0,
    thinking = 0,
    listening = 0,
    speaking = 0
  let spinOrigin = 0
  const duration = () =>
    active === 'spin'
      ? 2.6
      : active in performances
        ? performances[active as keyof typeof performances].at(-1)![0]
        : 0
  const worldRotation = (joint: THREE.Object3D, desired: THREE.Quaternion) => {
    joint.parent!.getWorldQuaternion(parentQ).invert()
    joint.quaternion.copy(parentQ.multiply(desired)).normalize()
    joint.updateWorldMatrix(false, true)
  }
  const rotate = (joint: THREE.Object3D, x: number, y: number, z: number) => {
    // The world axes are converted explicitly; Tripo's head-local Y is not world Y.
    q.setFromEuler(euler.set(x, y, z)).multiply(restWorld.get(joint.name)!)
    q.premultiply(rootQ)
    worldRotation(joint, q)
  }
  const begin = (name: MascotAction | 'idle') => {
    transition = {
      pose: { ...pose },
      velocity: { ...velocity },
      at: time,
      duration: active === 'idle' ? 0.3 : 0.75,
    }
    active = name === 'reset' ? 'idle' : name
    actionTime = time
    spinOrigin = pose.turn
  }
  const apply = (p: Pose, dt = 0) => {
    root.position.y = p.lift
    root.rotation.y = p.turn
    root.updateWorldMatrix(true, false)
    root.getWorldQuaternion(rootQ)
    for (const rest of rests) {
      rest.bone.position.copy(rest.position)
      rest.bone.quaternion.copy(rest.rotation)
      rest.bone.scale.copy(rest.scale)
    }
    model.updateWorldMatrix(true, true)
    target.copy(hipPosition).add(pole.set(p.hipX, p.hipY, p.hipZ))
    root.localToWorld(target)
    hip.position.copy(hip.parent!.worldToLocal(target))
    hip.updateWorldMatrix(false, true)
    rotate(chest, p.bodyPitch, p.bodyYaw, p.bodyRoll)
    rotate(
      head,
      p.headPitch + p.bodyPitch * 0.25,
      p.headYaw + p.bodyYaw * 0.35,
      p.headRoll + p.bodyRoll * 0.3,
    )
    arms.forEach((arm, index) => {
      const right = index === 0
      const x = right ? p.rightX : p.leftX,
        y = right ? p.rightY : p.leftY,
        z = right ? p.rightZ : p.leftZ
      target.set(x + p.hipX, y + p.hipY - neutral.hipY, z + p.hipZ)
      // Use a shoulder-relative pole with a forward component. An absolute
      // elbow point can cross the reach axis while lowering a wave, flipping IK.
      arm.shoulder.getWorldPosition(pole)
      pole.add(bendDirection.set(arm.sign * 0.75, -1, 0.12).applyQuaternion(rootQ))
      arm.solve(root.localToWorld(target), pole)
      const waving = right ? p.rightWave : p.leftWave,
        presenting = right ? p.rightPresent : p.leftPresent
      const wrist = right ? p.rightWrist : p.leftWrist
      // Keep the palm on the forearm's axis. Interpolate only its facing
      // direction; independent world-space finger poses fold the wrist sideways
      // during the lift and lowering, which is especially visible in profile.
      arm.hand.getWorldPosition(target)
      arm.elbow.getWorldPosition(pole)
      fingerDirection
        .copy(target)
        .sub(pole)
        .normalize()
        .applyQuaternion(wristQ.copy(rootQ).invert())
      q.copy(arm.orientation(fingerDirection.clone(), palmDirection.set(-arm.sign, 0, 0.1)))
        .slerp(arm.orientation(fingerDirection.clone(), palmDirection.set(0, 0, 1)), waving)
        .slerp(arm.orientation(fingerDirection.clone(), palmDirection.set(0, 1, 0.15)), presenting)
      // Transport the palm with the moving forearm, then ease its axial turn.
      // Projecting a fixed facing vector onto a changing arm can flip abruptly
      // near parallel directions, especially when another action interrupts.
      palmDirection.copy(arm.localPalm).applyQuaternion(q)
      if (dt === 0) arm.palmNormal.copy(palmDirection)
      else {
        wristQ.setFromUnitVectors(arm.previousDirection, fingerDirection)
        arm.palmNormal.applyQuaternion(wristQ).normalize()
        const angle = Math.atan2(
          fingerDirection.dot(bendDirection.copy(arm.palmNormal).cross(palmDirection)),
          arm.palmNormal.dot(palmDirection),
        )
        const turn = THREE.MathUtils.clamp(angle * (1 - Math.exp(-14 * dt)), -7 * dt, 7 * dt)
        arm.palmNormal.applyAxisAngle(fingerDirection, turn).normalize()
      }
      arm.previousDirection.copy(fingerDirection)
      q.copy(arm.orientation(fingerDirection.clone(), arm.palmNormal.clone()))
      q.premultiply(wristQ.setFromAxisAngle(axis, wrist)).premultiply(rootQ)
      // Pronation belongs in the forearm. Leaving all palm rotation at the
      // wrist collapses linear skinning into a thin "candy wrapper" seam.
      arm.hand.getWorldQuaternion(currentHandQ)
      inverseHandQ.copy(currentHandQ).invert()
      rollQ.copy(q).multiply(inverseHandQ)
      arm.hand.getWorldPosition(target)
      arm.elbow.getWorldPosition(pole)
      bendDirection.copy(target).sub(pole).normalize()
      const projection =
        rollQ.x * bendDirection.x + rollQ.y * bendDirection.y + rollQ.z * bendDirection.z
      rollQ.set(
        bendDirection.x * projection,
        bendDirection.y * projection,
        bendDirection.z * projection,
        rollQ.w,
      )
      if (rollQ.lengthSq() > 1e-8) {
        rollQ.normalize()
        // The palm must follow the forearm while a gesture lowers. A fixed
        // world-facing hand can otherwise fold backwards beyond a natural wrist.
        swingQ.copy(q).multiply(inverseHandQ).multiply(wristQ.copy(rollQ).invert())
        const swingAngle = 2 * Math.acos(Math.min(1, Math.abs(swingQ.w)))
        if (swingAngle > 0.82) {
          wristQ.copy(swingQ)
          swingQ.copy(identityQ).slerp(wristQ, 0.82 / swingAngle)
        }
        q.copy(swingQ).multiply(rollQ).multiply(currentHandQ)
        arm.elbow.getWorldQuaternion(baseForearmQ)
        forearmQ.copy(baseForearmQ).premultiply(rollQ)
        worldRotation(arm.elbow, forearmQ)
        // The rig already has two twist joints. Spread pronation down the
        // sleeve instead of concentrating the whole rotation at the elbow.
        arm.forearmTwists.forEach((joint, twist) => {
          twistQ.copy(baseForearmQ).slerp(forearmQ, twist === 0 ? 0.2 : 0.65)
          worldRotation(joint, twistQ)
        })
      }
      worldRotation(arm.hand, q)
    })
    legs.forEach((leg, index) => {
      target
        .copy(leg.position)
        .add(
          pole.set(
            index === 0 ? p.rightFootX : p.leftFootX,
            index === 0 ? p.rightFootY : p.leftFootY,
            index === 0 ? p.rightFootZ : p.leftFootZ,
          ),
        )
      pole.set(leg.position.x + p.hipX, 1, 1.5)
      leg.solve(root.localToWorld(target), root.localToWorld(pole))
      q.copy(leg.orientation).premultiply(rootQ)
      worldRotation(leg.foot, q)
    })
    model.updateWorldMatrix(true, true)
  }
  // Initialize a relaxed, grounded pose before the first visible render.
  apply(pose)
  return {
    perform(name: MascotAction) {
      begin(name)
    },
    update(dt: number, input: MotionInput) {
      if (input.reducedMotion) {
        time = actionTime = 0
        active = 'idle'
        transition = null
        pose = { ...neutral }
        previous = { ...neutral }
        for (const key of keys) velocity[key] = 0
        lookX = lookY = thinking = listening = speaking = 0
        apply(pose)
        return { action: 'idle', progress: 0, active: false }
      }
      dt = Math.max(0, Math.min(dt, 0.05))
      time += dt
      lastDt = dt || lastDt
      if (active !== 'idle' && time - actionTime >= duration()) begin('idle')
      const age = time - actionTime
      let next = sample(idle, time % 8.4)
      if (active in performances)
        next = sample(
          performances[active as keyof typeof performances],
          age,
          active === 'wave' || active === 'present',
        )
      if (active === 'jump' && age >= 0.48 && age <= 1.07) {
        const flight = (age - 0.48) / (1.07 - 0.48)
        next.lift = 0.55 * 4 * flight * (1 - flight)
      }
      if (active === 'spin') {
        next.turn = spinOrigin + smooth(age / 2.6) * Math.PI * 2
        next.headYaw = -Math.sin(smooth(age / 2.6) * Math.PI * 2) * 0.055
      } else {
        // Continue from the closest equivalent orientation when interrupted mid-turn.
        const turn = transition?.pose.turn ?? pose.turn
        next.turn = Math.round(turn / (Math.PI * 2)) * Math.PI * 2
      }
      const attend = input.interacting || active === 'spin' ? 0 : 1
      lookX = THREE.MathUtils.damp(lookX, input.gaze.x * attend, 5, dt)
      lookY = THREE.MathUtils.damp(lookY, input.gaze.y * attend, 5, dt)
      const conversational = active === 'idle' ? 1 : 0
      thinking = THREE.MathUtils.damp(
        thinking,
        input.mood === 'thinking' ? conversational : 0,
        4,
        dt,
      )
      listening = THREE.MathUtils.damp(
        listening,
        input.mood === 'listening' ? conversational : 0,
        4,
        dt,
      )
      speaking = THREE.MathUtils.damp(
        speaking,
        input.mood === 'speaking' ? conversational : 0,
        4,
        dt,
      )
      next.headYaw += lookX * 12 * radians * (active === 'wave' ? 0.35 : 1) + thinking * 0.07
      next.headPitch += -lookY * 9 * radians - thinking * 0.025 + listening * 0.025
      next.headRoll += thinking * 0.055
      next.bodyPitch += listening * 0.018
      // A small, paced conversational beat; hands return to rest between phrases.
      const beat = sample(
        [
          [0, {}],
          [1.2, { leftY: 2.2, leftX: 0.84, leftZ: 0.3, leftPresent: 0.65, headPitch: 0.025 }],
          [2.4, { leftY: 2.15, leftX: 0.8, leftZ: 0.28, leftPresent: 0.55 }],
          [3.6, {}],
          [6.2, {}],
        ],
        time % 6.2,
      )
      for (const key of ['leftX', 'leftY', 'leftZ', 'leftPresent', 'headPitch'] as Key[])
        next[key] += (beat[key] - neutral[key]) * speaking
      if (transition) {
        const elapsed = time - transition.at
        const weight = smooth(elapsed / transition.duration)
        for (const key of keys) {
          const outgoing =
            transition.pose[key] + transition.velocity[key] * elapsed * Math.exp(-elapsed / 0.12)
          next[key] = mix(outgoing, next[key], weight)
        }
        if (elapsed >= transition.duration) transition = null
      }
      next.lift = Math.max(0, next.lift)
      next.rightFootY = Math.max(0, next.rightFootY)
      next.leftFootY = Math.max(0, next.leftFootY)
      previous = pose
      pose = next
      for (const key of keys) velocity[key] = (pose[key] - previous[key]) / lastDt
      apply(pose, dt)
      return {
        action: active,
        progress: active === 'idle' ? 0 : Math.min(1, age / duration()),
        active: active !== 'idle',
      }
    },
    get state() {
      return { action: active, time: time - actionTime, duration: duration(), pose: { ...pose } }
    },
  }
}
export type MascotMotion = ReturnType<typeof createMascotMotion>
