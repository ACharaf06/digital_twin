import { test, expect, type Page } from '@playwright/test'
import type {} from '../src/dev/motion-lab'

async function lab(page: Page) {
  await page.goto('/motion-lab.html')
  await page.waitForFunction(() => window.__ready === true)
}

test('standing gestures keep both feet planted and the greeting raises an open hand', async ({
  page,
}) => {
  await lab(page)
  const result = await page.evaluate(() => {
    const { rig, model, input, joints } = window.motionLab
    const motion = rig!.motion!
    motion.update(0, { ...input, reducedMotion: true })
    const feet = joints().filter((j) => j.name.endsWith('Foot'))
    let drift = 0,
      handHeight = 0,
      minimum = Infinity,
      maximum = -Infinity
    for (const action of ['reset', 'wave', 'present'] as const) {
      motion.perform(action)
      for (let frame = 0; frame < 360; frame++) {
        motion.update(1 / 60, { ...input, mood: action === 'reset' ? 'speaking' : 'idle' })
        for (const [index, foot] of joints()
          .filter((j) => j.name.endsWith('Foot'))
          .entries()) {
          drift = Math.max(
            drift,
            Math.hypot(...foot.position.map((v, i) => v - feet[index].position[i])),
          )
        }
        if (action === 'wave')
          handHeight = Math.max(handHeight, joints().find((j) => j.name === 'R_Hand')!.position[1])
        if (frame % 60 === 0) {
          let floor = Infinity
          model.traverse((object) => {
            if ('isSkinnedMesh' in object && object.isSkinnedMesh) {
              const mesh = object as import('three').SkinnedMesh
              mesh.computeBoundingBox()
              const box = mesh.boundingBox!.clone().applyMatrix4(mesh.matrixWorld)
              floor = Math.min(floor, box.min.y)
            }
          })
          minimum = Math.min(minimum, floor)
          maximum = Math.max(maximum, floor)
        }
      }
    }
    return { drift, handHeight, minimum, maximum }
  })
  await test.info().attach('grounding-metrics', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  })
  expect(result.drift).toBeLessThan(0.012)
  expect(result.handHeight).toBeGreaterThan(3.05)
  expect(result.minimum).toBeGreaterThan(-0.05)
  expect(result.maximum).toBeLessThan(0.06)
})

test('jump crouches, clears the floor, lands, and spin completes a full turn', async ({ page }) => {
  await lab(page)
  const result = await page.evaluate(() => {
    const { rig, input, joints } = window.motionLab,
      motion = rig!.motion!
    motion.update(0, { ...input, reducedMotion: true })
    const hip = joints().find((j) => j.name === 'Hip')!.position[1]
    motion.perform('jump')
    let crouch = hip,
      clearance = 0
    for (let frame = 0; frame < 150; frame++) {
      motion.update(1 / 60, input)
      const positions = joints()
      if (frame < 28)
        crouch = Math.min(crouch, positions.find((j) => j.name === 'Hip')!.position[1])
      clearance = Math.max(
        clearance,
        Math.min(...positions.filter((j) => j.name.endsWith('Foot')).map((j) => j.position[1])),
      )
    }
    const landed = joints()
      .filter((j) => j.name.endsWith('Foot'))
      .map((j) => j.position[1])
    const finished = motion.state.action
    motion.perform('spin')
    for (let frame = 0; frame < 78; frame++) motion.update(1 / 60, input)
    const halfway = rig!.root.rotation.y
    for (let frame = 0; frame < 120; frame++) motion.update(1 / 60, input)
    return {
      hip,
      crouch,
      clearance,
      landed,
      finished,
      halfway,
      turn: rig!.root.rotation.y,
      action: motion.state.action,
    }
  })
  await test.info().attach('action-metrics', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  })
  expect(result.hip - result.crouch).toBeGreaterThan(0.08)
  expect(result.clearance).toBeGreaterThan(0.55)
  expect(Math.max(...result.landed)).toBeLessThan(0.14)
  expect(result.finished).toBe('idle')
  expect(result.halfway).toBeCloseTo(Math.PI, 1)
  expect(result.turn).toBeCloseTo(2 * Math.PI, 3)
  expect(result.action).toBe('idle')
})

test('interruptions and repeated gestures stay continuous without wrist flips', async ({
  page,
}) => {
  await lab(page)
  const result = await page.evaluate(() => {
    const { rig, model, input, joints } = window.motionLab,
      motion = rig!.motion!
    motion.update(0, { ...input, reducedMotion: true })
    const names = ['R_Hand', 'L_Hand', 'Head', 'R_Forearm', 'L_Forearm']
    const bones = names.map((name) => model.getObjectByName(name)!)
    const previous = bones.map((b) => b.quaternion.clone())
    let maxAngle = 0,
      maxTravel = 0,
      restarted = false,
      peakFrame = 0,
      peakBone = ''
    let old = joints().find((j) => j.name === 'R_Hand')!.position
    const requests = new Map<number, 'wave' | 'dance' | 'jump' | 'present' | 'reset'>([
      [0, 'wave'],
      [90, 'wave'],
      [130, 'dance'],
      [158, 'present'],
      [184, 'jump'],
      [230, 'wave'],
      [252, 'reset'],
    ])
    for (let frame = 0; frame < 420; frame++) {
      const request = requests.get(frame)
      if (request) motion.perform(request)
      motion.update(1 / 60, input)
      if (frame === 90) restarted = motion.state.time < 0.02
      bones.forEach((b, i) => {
        const angle = previous[i].angleTo(b.quaternion)
        if (angle > maxAngle) {
          maxAngle = angle
          peakFrame = frame
          peakBone = b.name
        }
        previous[i].copy(b.quaternion)
      })
      const position = joints().find((j) => j.name === 'R_Hand')!.position
      maxTravel = Math.max(maxTravel, Math.hypot(...position.map((v, i) => v - old[i])))
      old = position
    }
    return { maxAngle, maxTravel, restarted, peakFrame, peakBone, action: motion.state.action }
  })
  await test.info().attach('continuity-metrics', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  })
  expect(result.restarted).toBe(true)
  expect(result.maxAngle, JSON.stringify(result)).toBeLessThan(0.35)
  expect(result.maxTravel).toBeLessThan(0.15)
  expect(result.action).toBe('idle')
})

test('motion timing is consistent at 30/60/120 fps and reduced motion never accumulates transforms', async ({
  page,
}) => {
  await lab(page)
  const result = await page.evaluate(() => {
    const { rig, input, joints, model } = window.motionLab,
      motion = rig!.motion!
    const samples = []
    for (const fps of [30, 60, 120]) {
      motion.update(0, { ...input, reducedMotion: true })
      motion.perform('wave')
      for (let frame = 0; frame < fps * 1.5; frame++) motion.update(1 / fps, input)
      samples.push(joints().map((j) => j.position))
    }
    const reference = samples[1]
    const error = Math.max(
      ...samples.flatMap((sample) =>
        sample.map((p, i) => Math.hypot(...p.map((v, k) => v - reference[i][k]))),
      ),
    )
    motion.update(0, { ...input, reducedMotion: true })
    const before = model.getObjectByName('Head')!.matrixWorld.toArray()
    for (let frame = 0; frame < 600; frame++) {
      if (frame % 60 === 0) motion.perform('jump')
      input.gaze.set(Math.sin(frame), Math.cos(frame))
      motion.update(1 / 60, { ...input, reducedMotion: true, mood: 'speaking' })
    }
    const after = model.getObjectByName('Head')!.matrixWorld.toArray()
    return {
      error,
      drift: Math.max(...after.map((v, i) => Math.abs(v - before[i]))),
      action: motion.state.action,
    }
  })
  await test.info().attach('timing-metrics', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  })
  expect(result.error).toBeLessThan(0.015)
  expect(result.drift).toBeLessThan(1e-8)
  expect(result.action).toBe('idle')
})

test('replacement hands have five articulated fingers, valid skinning, and smooth wrist deformation', async ({
  page,
}) => {
  await lab(page)
  const result = await page.evaluate(() => {
    const { rig, model, input } = window.motionLab,
      motion = rig!.motion!
    const meshes: import('three').SkinnedMesh[] = []
    model.traverse((object) => {
      if (object.name.includes('FiveFingerHand')) meshes.push(object as import('three').SkinnedMesh)
    })
    const fingerCounts = meshes.map(
      (mesh) =>
        mesh.skeleton.bones.filter((b) => /_(index|middle|ring|pinky|thumb)_0$/.test(b.name))
          .length,
    )
    let weightError = 0,
      invalid = false,
      stretch = 0
    let peak: unknown = null
    for (const mesh of meshes) {
      const weights = mesh.geometry.attributes.skinWeight,
        indices = mesh.geometry.attributes.skinIndex
      for (let i = 0; i < weights.count; i++) {
        weightError = Math.max(
          weightError,
          Math.abs(weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i) - 1),
        )
        for (const index of [indices.getX(i), indices.getY(i), indices.getZ(i), indices.getW(i)])
          invalid ||= index < 0 || index >= mesh.skeleton.bones.length
      }
    }
    motion.update(0, { ...input, reducedMotion: true })
    const finger = model.getObjectByName('Studio_0_middle_1')!
    const resting = finger.quaternion.clone()
    let opened = 0
    for (const action of ['wave', 'present', 'dance'] as const) {
      motion.perform(action)
      for (let frame = 0; frame < 240; frame++) {
        motion.update(1 / 60, input)
        if (action === 'wave') opened = Math.max(opened, resting.angleTo(finger.quaternion))
        if (frame % 40) continue
        for (const mesh of meshes) {
          const geometry = mesh.geometry,
            index = geometry.index!,
            positions = geometry.attributes.position
          const a = mesh.position.clone(),
            b = a.clone(),
            originalA = a.clone(),
            originalB = a.clone()
          for (let edge = 0; edge < index.count; edge++) {
            const ai = index.getX(edge),
              bi = index.getX(Math.floor(edge / 3) * 3 + ((edge + 1) % 3))
            originalA.fromBufferAttribute(positions, ai)
            originalB.fromBufferAttribute(positions, bi)
            const original = originalA.distanceTo(originalB)
            if (original < 0.003) continue
            mesh.getVertexPosition(ai, a)
            mesh.getVertexPosition(bi, b)
            const ratio = a.distanceTo(b) / original
            if (!Number.isFinite(ratio)) invalid = true
            if (ratio > stretch) {
              stretch = ratio
              peak = {
                hand: mesh.name,
                action,
                frame,
                a: originalA.toArray(),
                b: originalB.toArray(),
                ia: [
                  mesh.geometry.attributes.skinIndex.getX(ai),
                  mesh.geometry.attributes.skinIndex.getY(ai),
                  mesh.geometry.attributes.skinIndex.getZ(ai),
                ],
                ib: [
                  mesh.geometry.attributes.skinIndex.getX(bi),
                  mesh.geometry.attributes.skinIndex.getY(bi),
                  mesh.geometry.attributes.skinIndex.getZ(bi),
                ],
                wa: [
                  mesh.geometry.attributes.skinWeight.getX(ai),
                  mesh.geometry.attributes.skinWeight.getY(ai),
                  mesh.geometry.attributes.skinWeight.getZ(ai),
                ],
                wb: [
                  mesh.geometry.attributes.skinWeight.getX(bi),
                  mesh.geometry.attributes.skinWeight.getY(bi),
                  mesh.geometry.attributes.skinWeight.getZ(bi),
                ],
              }
            }
          }
        }
      }
    }
    return { hands: meshes.length, fingerCounts, weightError, invalid, opened, stretch, peak }
  })
  await test.info().attach('hand-metrics', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  })
  expect(result.hands).toBe(2)
  expect(result.fingerCounts).toEqual([5, 5])
  expect(result.invalid).toBe(false)
  expect(result.weightError).toBeLessThan(1e-6)
  expect(result.opened).toBeGreaterThan(0.25)
  expect(result.stretch, JSON.stringify(result)).toBeLessThan(2.5)
})

test('hand anatomy faces the right way and both cuffs stay covered through gestures', async ({
  page,
}) => {
  await lab(page)
  const result = await page.evaluate(() => {
    const { model, rig, input, sample, THREE } = window.motionLab
    let body: import('three').SkinnedMesh | undefined
    model.traverse((object) => {
      if (
        'isSkinnedMesh' in object &&
        object.isSkinnedMesh &&
        'cuffSeams' in (object as import('three').SkinnedMesh).geometry.userData
      )
        body = object as import('three').SkinnedMesh
    })
    const seams = body!.geometry.userData.cuffSeams as [number[], number[]]
    const hands = [0, 1].map(
      (index) =>
        model.getObjectByName(`Studio_${index}_FiveFingerHand`) as import('three').SkinnedMesh,
    )
    const cuffVertices = hands.map((hand) => {
      const positions = hand.geometry.attributes.position
      return Array.from({ length: positions.count }, (_, index) => index).filter(
        (index) => positions.getY(index) < 0.14,
      )
    })
    let gap = 0
    let peak: unknown = null
    for (const action of ['wave', 'present', 'dance', 'jump'] as const) {
      rig!.motion!.update(0, { ...input, reducedMotion: true })
      rig!.motion!.perform(action)
      for (let frame = 0; frame < 240; frame++) {
        rig!.motion!.update(1 / 60, input)
        if (frame % 40) continue
        hands.forEach((hand, side) => {
          const surface = cuffVertices[side].map((index) =>
            hand.getVertexPosition(index, new THREE.Vector3()).applyMatrix4(hand.matrixWorld),
          )
          for (const vertex of seams[side]) {
            const point = body!
              .getVertexPosition(vertex, new THREE.Vector3())
              .applyMatrix4(body!.matrixWorld)
            let nearest = Infinity
            for (const candidate of surface)
              nearest = Math.min(nearest, point.distanceToSquared(candidate))
            nearest = Math.sqrt(nearest)
            if (nearest > gap) {
              gap = nearest
              peak = { action, frame, side, point: point.toArray() }
            }
          }
        })
      }
    }
    sample('wave', 1.15)
    const thumb = model.getObjectByName('Studio_0_thumb_2')!.getWorldPosition(new THREE.Vector3())
    const middle = model.getObjectByName('Studio_0_middle_2')!.getWorldPosition(new THREE.Vector3())
    const wristSection = new THREE.Box3()
    const positions = hands[0].geometry.attributes.position
    for (let vertex = 0; vertex < positions.count; vertex++)
      if (positions.getY(vertex) >= -0.027 && positions.getY(vertex) <= 0.02)
        wristSection.expandByPoint(new THREE.Vector3().fromBufferAttribute(positions, vertex))
    return {
      gap,
      peak,
      seams: seams.map((s) => s.length),
      thumbSide: thumb.x - middle.x,
      wristDepth:
        wristSection.getSize(new THREE.Vector3()).z *
        Math.abs(hands[0].getWorldScale(new THREE.Vector3()).z),
      hems: (body!.geometry.userData.cuffInnerSeams as number[][]).map((seam) => seam.length),
      mirrored:
        model.getObjectByName('RightStudioHand')!.scale.x *
          model.getObjectByName('LeftStudioHand')!.scale.x <
        0,
    }
  })
  await test.info().attach('cuff-and-anatomy-metrics', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  })
  expect(result.seams.every((count) => count > 12)).toBe(true)
  expect(result.thumbSide).toBeGreaterThan(0.08)
  expect(result.mirrored).toBe(true)
  expect(result.hems.every((count) => count > 12)).toBe(true)
  expect(result.wristDepth).toBeGreaterThan(0.06)
  expect(result.wristDepth).toBeLessThan(0.15)
  expect(result.gap, JSON.stringify(result)).toBeLessThan(0.055)
})

test('profile wave keeps the wrist aligned, the elbow behind the hand, and hands proportional', async ({
  page,
}) => {
  await lab(page)
  const result = await page.evaluate(() => {
    const { model, rig, input, THREE } = window.motionLab
    const motion = rig!.motion!
    motion.update(0, { ...input, reducedMotion: true })
    motion.perform('wave')
    const wrist = model.getObjectByName('R_Hand')!,
      elbow = model.getObjectByName('R_Forearm')!,
      middle = model.getObjectByName('Studio_0_middle_0')!
    let wristAngle = 0,
      elbowAhead = 0,
      maxStep = 0,
      peakFrame = 0,
      approachSpeed = Infinity
    const position = new THREE.Vector3(),
      forearm = new THREE.Vector3(),
      palm = new THREE.Vector3(),
      previous = new THREE.Quaternion(),
      rotation = new THREE.Quaternion(),
      previousPosition = wrist.getWorldPosition(new THREE.Vector3())
    wrist.getWorldQuaternion(previous)
    for (let frame = 0; frame < 240; frame++) {
      motion.update(1 / 60, input)
      wrist.getWorldPosition(position)
      if (frame === 18 || frame === 19)
        approachSpeed = Math.min(approachSpeed, position.distanceTo(previousPosition) * 60)
      previousPosition.copy(position)
      elbow.getWorldPosition(forearm)
      elbowAhead = Math.max(elbowAhead, forearm.z - position.z)
      forearm.subVectors(position, forearm).normalize()
      middle.getWorldPosition(palm).sub(position).normalize()
      wristAngle = Math.max(wristAngle, forearm.angleTo(palm))
      wrist.getWorldQuaternion(rotation)
      const step = previous.angleTo(rotation)
      if (step > maxStep) {
        maxStep = step
        peakFrame = frame
      }
      previous.copy(rotation)
    }
    const hand = model.getObjectByName('Studio_0_FiveFingerHand') as import('three').SkinnedMesh
    const positions = hand.geometry.attributes.position
    let length = 0
    for (let i = 0; i < positions.count; i++) length = Math.max(length, positions.getY(i))
    length *= Math.abs(hand.getWorldScale(new THREE.Vector3()).y)
    return { wristAngle, elbowAhead, maxStep, peakFrame, length, approachSpeed }
  })
  await test.info().attach('profile-wave-metrics', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  })
  expect(result.wristAngle, JSON.stringify(result)).toBeLessThan(0.42)
  expect(result.elbowAhead, JSON.stringify(result)).toBeLessThan(0.12)
  expect(result.maxStep, JSON.stringify(result)).toBeLessThan(0.2)
  expect(result.length).toBeGreaterThan(0.32)
  expect(result.length).toBeLessThan(0.4)
  expect(result.approachSpeed, JSON.stringify(result)).toBeGreaterThan(0.3)
})
