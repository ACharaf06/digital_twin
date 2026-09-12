import { test, expect, type Page } from '@playwright/test'
import { PNG } from 'pngjs'

async function enter(page: Page) {
  await page.goto('/')
  await expect(page.locator('.mascot-stage')).toHaveAttribute('data-ready', 'true', {
    timeout: 20000,
  })
  const entry = page.getByRole('button', { name: 'Come on in' })
  if (await entry.isVisible()) await entry.click()
  await expect(page.locator('main')).toHaveClass(/has-entered/)
  await page.waitForTimeout(4300)
}
function changed(a: Buffer, b: Buffer) {
  const first = PNG.sync.read(a),
    second = PNG.sync.read(b)
  let difference = 0
  for (let i = 0; i < first.data.length; i += 4)
    if (
      Math.abs(first.data[i] - second.data[i]) +
        Math.abs(first.data[i + 1] - second.data[i + 1]) +
        Math.abs(first.data[i + 2] - second.data[i + 2]) >
      25
    )
      difference++
  return difference
}

test('real geometry renders, moves, orbits, and responds to actions', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await enter(page)
  const canvas = page.locator('canvas')
  const front = await canvas.screenshot()
  const pixels = PNG.sync.read(front)
  let characterPixels = 0
  for (let i = 0; i < pixels.data.length; i += 4)
    if (pixels.data[i] < 170 && pixels.data[i + 1] < 170 && pixels.data[i + 2] < 170)
      characterPixels++
  expect(characterPixels).toBeGreaterThan(50000)
  expect(
    Number(await page.locator('.mascot-stage').getAttribute('data-mesh-triangles')),
  ).toBeGreaterThan(10000)
  await page.screenshot({ path: info.outputPath('desktop.png') })
  await page.getByRole('button', { name: 'Say hello', exact: true }).click()
  await page.waitForTimeout(650)
  expect(changed(front, await canvas.screenshot())).toBeGreaterThan(4000)
  await page.getByRole('button', { name: 'See the geometry' }).click()
  await expect(page.locator('.mascot-stage')).toHaveAttribute('data-wireframe', 'true')
  expect(changed(front, await canvas.screenshot())).toBeGreaterThan(30000)
  await page.screenshot({ path: info.outputPath('geometry.png') })
  await page.getByRole('button', { name: 'See the geometry' }).click()
  await page.getByRole('button', { name: 'Reset view' }).click()
  await page.mouse.move(570, 400)
  await page.mouse.down()
  await page.mouse.move(960, 400, { steps: 20 })
  await page.mouse.up()
  await page.waitForTimeout(1000)
  expect(changed(front, await canvas.screenshot())).toBeGreaterThan(30000)
  await page.screenshot({ path: info.outputPath('orbit.png') })
  await page.getByRole('button', { name: 'Reset view' }).click()
  // the reset animates the camera back, so let it settle before aiming at the head
  await page.waitForTimeout(1500)
  await page.mouse.click(533, 232)
  await expect(page.locator('.mascot-bubble')).toContainText('tickles')
  await expect(page.locator('.mascot-stage')).toHaveAttribute('data-action', 'jump')
  expect(errors).toEqual([])
})

test('responsive layouts have no horizontal overflow or overlapping controls', async ({
  page,
}, info) => {
  await enter(page)
  for (const [width, height] of [
    [320, 568],
    [375, 667],
    [390, 844],
    [768, 1024],
    [1024, 768],
    [1440, 900],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width, height })
    await page.getByRole('button', { name: 'Reset view' }).click()
    await page.waitForTimeout(1900)
    const layout = await page.evaluate(() => {
      const selectors = [
        '.studio-header',
        '.studio-tabs',
        '.console-heading',
        '.conversation-starters',
        '.chat-composer',
        '.console-status',
        '.mascot-tools',
        '.studio-footer',
      ]
      const regions = selectors.map((selector) => ({
        selector,
        rect: document.querySelector(selector)!.getBoundingClientRect(),
      }))
      const collisions: string[][] = []
      for (let i = 0; i < regions.length; i++)
        for (let j = i + 1; j < regions.length; j++) {
          const a = regions[i],
            b = regions[j]
          if (
            a.rect.left < b.rect.right &&
            a.rect.right > b.rect.left &&
            a.rect.top < b.rect.bottom - 2 &&
            a.rect.bottom > b.rect.top + 2
          )
            collisions.push([a.selector, b.selector])
        }
      return {
        width: document.documentElement.scrollWidth,
        tabs: {
          clientWidth: document.querySelector('.studio-tabs')!.clientWidth,
          scrollWidth: document.querySelector('.studio-tabs')!.scrollWidth,
        },
        collisions,
        overflow: Array.from(document.querySelectorAll('h1,h2,p,button,input,a'))
          .filter(
            (el) =>
              (el as HTMLElement).offsetWidth > 0 &&
              !el.querySelector('.tool-tip') &&
              el.scrollWidth > el.clientWidth + 2 &&
              getComputedStyle(el).display !== 'inline',
          )
          .map((el) => el.className),
      }
    })
    expect(layout.width, `${width} page width`).toBe(width)
    expect(layout.tabs.scrollWidth, `${width} tab width`).toBeLessThanOrEqual(
      layout.tabs.clientWidth,
    )
    expect(layout.collisions, `${width} collisions`).toEqual([])
    expect(layout.overflow, `${width} text overflow`).toEqual([])
    const canvasPixels = PNG.sync.read(await page.locator('canvas').screenshot())
    let rendered = 0
    for (let i = 0; i < canvasPixels.data.length; i += 4)
      if (
        canvasPixels.data[i] < 170 &&
        canvasPixels.data[i + 1] < 170 &&
        canvasPixels.data[i + 2] < 170
      )
        rendered++
    expect(rendered, `${width} character pixels`).toBeGreaterThan(1000)
    await page.screenshot({ path: info.outputPath(`studio-${width}x${height}.png`) })
  }
})

test('streamed replies drive the character, cancellation and reset work', async ({ page }) => {
  const sessions: string[] = []
  await page.route('**/api/health', (route) => route.fulfill({ json: { status: 'ready' } }))
  await page.route('**/api/chat', async (route) => {
    const body = route.request().postDataJSON() as { sessionId: string }
    sessions.push(body.sessionId)
    await new Promise((resolve) => setTimeout(resolve, 800))
    await route.fulfill({
      contentType: 'text/event-stream',
      body:
        'data: {"sources":["my thesis"]}\n\n' +
        'data: {"delta":"Charaf builds RAG and function-calling systems at Amadeus."}\n\n' +
        'data: {"done":true}\n\n',
    })
  })
  await enter(page)
  const input = page.getByRole('textbox', { name: "Ask Charaf's digital twin" })
  await input.fill('What do you build?')
  await expect(page.locator('.mascot-stage')).toHaveAttribute('data-mood', 'listening')
  await input.press('Enter')
  await expect(page.locator('.mascot-stage')).toHaveAttribute('data-mood', 'thinking')
  await expect(page.locator('.chat-message').last()).toContainText('Amadeus')
  await expect(page.locator('.chat-log')).toHaveAttribute('aria-busy', 'false')
  expect(sessions[0]).toMatch(/^[0-9a-f-]{36}$/)
  // provenance chip: the engine named the documents it grounded the reply in
  await expect(page.locator('.message-sources')).toContainText('my thesis')
  await input.fill('Another question')
  await input.press('Enter')
  await page.getByRole('button', { name: 'Stop reply' }).click()
  await expect(page.locator('.chat-log')).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator('.chat-message')).toHaveCount(3)
  await expect(page.locator('.chat-message').last()).toContainText('Another question')
  expect(sessions[1]).toBe(sessions[0])
  await page.getByRole('button', { name: 'Reset conversation' }).click()
  await expect(page.locator('.chat-message')).toHaveCount(0)
  // The starter plays the gesture, but the words come from the engine like any
  // other question -- so the reply is the streamed one, not a scripted line.
  await page.getByRole('button', { name: 'Surprise me', exact: true }).click()
  await expect(page.locator('.mascot-stage')).toHaveAttribute('data-action', 'dance')
  await expect(page.locator('.chat-message').last()).toContainText('Amadeus')
  await expect(page.locator('.chat-message').last()).not.toContainText('dance moves')
  expect(sessions[2]).not.toBe(sessions[0])
})

test('unavailable AI, project navigation and genuine contacts', async ({ page }, info) => {
  await page.route('**/api/health', (route) => route.fulfill({ json: { status: 'offline' } }))
  await enter(page)
  await expect(page.locator('.console-status')).toContainText('AI unavailable')
  await expect(page.getByRole('textbox', { name: "Ask Charaf's digital twin" })).toBeDisabled()
  await expect(page.locator('.chat-message')).toHaveCount(0)
  await page.getByRole('button', { name: 'My work', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Professional' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Personal' })).toBeVisible()
  await expect(page.locator('.experience-list')).toContainText('October 2025 – October 2026')
  await expect(page.locator('.experience-list')).toContainText('3 May – 29 August 2025')
  await expect(page.locator('.experience-list')).toContainText('June – September 2024')
  expect(await page.locator('.project-row strong').allTextContents()).toEqual([
    'A little more human.',
    'Jutsu in, anime out.',
    'From events to attention.',
  ])
  await page.getByRole('button', { name: /Jutsu in, anime out/ }).click()
  await expect
    .poll(() =>
      page.getByRole('region', { name: 'Selected work' }).evaluate((node) => node.scrollTop),
    )
    .toBe(0)
  await expect(page.locator('.project-detail')).toContainText('AnimeGANv2')
  await expect(
    page.getByAltText('Reference chart of twelve Naruto-inspired hand signs'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'All work' }).click()
  await page.getByRole('button', { name: /From events to attention/ }).click()
  await expect
    .poll(() =>
      page.getByRole('region', { name: 'Selected work' }).evaluate((node) => node.scrollTop),
    )
    .toBe(0)
  await expect(page.locator('.project-detail')).toContainText('Intel’s Lava framework')
  await expect(page.getByAltText('Intel Loihi neuromorphic research chip')).toBeVisible()
  await page.screenshot({ path: info.outputPath('project.png') })
  await expect(page.getByRole('button', { name: 'Ask me about this' })).toBeDisabled()
  await page.getByRole('button', { name: 'Studies', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Studies' })).toBeVisible()
  expect(await page.locator('.study-card h3').allTextContents()).toEqual([
    'Mastère Spécialisé® Big Data',
    'Engineering degree, Artificial Intelligence major',
    'BSc Applied Mathematics & Computer Science (MIASHS)',
  ])
  await expect(page.locator('.study-list')).toContainText('2025–2026')
  await expect(page.locator('.study-list')).toContainText('2023–2025')
  await expect(page.locator('.study-list')).toContainText('2020–2023')
  await expect(page.locator('.study-list')).toContainText('KTH Royal Institute of Technology')
  await expect(page.locator('.study-list')).toContainText('top 5%')
  await page.getByRole('button', { name: 'The human', exact: true }).click()
  await expect(page.getByRole('link', { name: profileEmail })).toHaveAttribute(
    'href',
    `mailto:${profileEmail}`,
  )
  await expect(page.getByRole('link', { name: 'LinkedIn', exact: true })).toHaveAttribute(
    'href',
    'https://www.linkedin.com/in/charaf-achir-19b6b21a3/',
  )
  await expect(page.getByRole('link', { name: 'GitHub', exact: true })).toHaveAttribute(
    'href',
    'https://github.com/ACharaf06',
  )
  await page.screenshot({ path: info.outputPath('human.png') })
})

test('a failed live request produces no canned assistant answer', async ({ page }) => {
  await page.route('**/api/health', (route) => route.fulfill({ json: { status: 'ready' } }))
  await page.route('**/api/chat', (route) => route.fulfill({ status: 503 }))
  await enter(page)
  const input = page.getByRole('textbox', { name: "Ask Charaf's digital twin" })
  await input.fill('Tell me about your work')
  await input.press('Enter')
  await expect(page.locator('.console-status')).toContainText('AI unavailable')
  await expect(page.locator('.chat-message')).toHaveCount(1)
  await expect(page.locator('.chat-message').first()).toContainText('Tell me about your work')
  await expect(page.locator('.message-assistant')).toHaveCount(0)
})
const profileEmail = 'charaf.achir6@gmail.com'

test('reduced motion is stable and an empty WebGL fallback keeps chat usable', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await enter(page)
  await page.getByRole('button', { name: 'Reset view' }).click()
  await page.mouse.move(1430, 895)
  await page.waitForTimeout(1600)
  const a = await page.locator('canvas').screenshot()
  await page.waitForTimeout(500)
  expect(changed(a, await page.locator('canvas').screenshot())).toBeLessThan(20)
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type.startsWith('webgl') || type === 'experimental-webgl') return null
      return original.apply(this, [type, ...args] as Parameters<typeof original>)
    } as typeof original
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(page.locator('.mascot-stage')).toHaveAttribute('data-fallback', 'empty')
  await expect(page.locator('.mascot-stage img')).toHaveCount(0)
  await expect(page.locator('.mascot-stage canvas')).toHaveCount(0)
  await page.getByRole('button', { name: 'Come on in' }).click()
  await expect(page.getByRole('textbox', { name: "Ask Charaf's digital twin" })).toBeVisible()
  await page.screenshot({ path: info.outputPath('webgl-fallback.png') })
})

test('a hand setup failure keeps the authored mascot in a neutral pose', async ({ page }) => {
  await page.goto('/?mascot=neutral')
  const stage = page.locator('.mascot-stage')
  await expect(stage).toHaveAttribute('data-ready', 'true', { timeout: 20000 })
  await expect(stage).toHaveAttribute('data-asset', 'neutral')
  await expect(stage).toHaveAttribute('data-motion', 'neutral')
  await expect(stage.locator('canvas')).toBeVisible()
  await expect(stage.locator('img')).toHaveCount(0)
})
