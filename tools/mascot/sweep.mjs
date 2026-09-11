// Bone-rotation sweep: pose the rig at the amplitudes MascotStage actually uses
// and screenshot each, so deformation artifacts (armpit tearing) are visible.
import { chromium } from '/Users/charafachir/projects/my_portfolio/web/node_modules/playwright/index.mjs'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

const file = process.argv[2] || 'charaf_rigged.glb'
const dir = new URL('./viewer/', import.meta.url).pathname
const types = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.png': 'image/png' }
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(req.url.split('?')[0])
    const body = await readFile(join(dir, p === '/' ? 'index.html' : p))
    res.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream' })
    res.end(body)
  } catch { res.writeHead(404).end('nope') }
})
await new Promise((r) => server.listen(0, r))
const port = server.address().port

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--use-angle=metal'],
})
const page = await browser.newPage({ viewport: { width: 820, height: 1000 } })
page.on('console', (m) => { if (m.type() === 'error') console.log('  [err]', m.text().slice(0, 160)) })

// MascotStage's real amplitudes, plus the extremes of `wave`.
const poses = [
  ['00-bind', ''],
  ['01-wave-half', 'RightShoulder.z:-0.55,RightElbow.z:-0.4'],
  ['02-wave-full', 'RightShoulder.z:-1.05,RightElbow.z:-0.75'],
  ['03-wave-extreme', 'RightShoulder.z:-1.6,RightElbow.z:-0.9'],
  ['04-present', 'RightShoulder.x:-0.65,RightElbow.x:-0.72'],
  ['05-think', 'LeftShoulder.x:-0.5,LeftElbow.x:-0.9'],
  ['06-dance-legs', 'RightHip.x:0.2,LeftHip.x:-0.2,RightHip.z:-0.09,LeftHip.z:0.09'],
  ['07-head-turn', 'Head.y:0.6,Head.x:0.18'],
  ['08-spine-sway', 'Spine.z:0.14,Chest.z:0.1'],
]
for (const [name, pose] of poses) {
  const url = `http://127.0.0.1:${port}/index.html?file=${encodeURIComponent(file)}&yaw=-0.35&pitch=0.05&dist=4.6&ty=1.0&pose=${encodeURIComponent(pose)}`
  await page.goto(url)
  await page.waitForFunction('window.__ready === true', null, { timeout: 60000 })
  const err = await page.evaluate('window.__error || null')
  if (err) { console.error('LOAD ERROR:', err); break }
  await page.waitForTimeout(320)
  await page.screenshot({ path: `sweep-${name}.png` })
  console.log('wrote', `sweep-${name}.png`, pose ? `(${pose})` : '')
}
await browser.close()
server.close()
