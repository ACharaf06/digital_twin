// Run MediaPipe Pose in a real browser and dump landmarks to JSON.
import { chromium } from '/Users/charafachir/projects/my_portfolio/web/node_modules/playwright/index.mjs'
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

const dir = new URL('./pose/', import.meta.url).pathname
const file = process.argv[2] || 'preprocessed.png'
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.png': 'image/png',
  '.json': 'application/json',
}
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(req.url.split('?')[0])
    const body = await readFile(join(dir, path === '/' ? 'index.html' : path))
    res.writeHead(200, {
      'content-type': types[extname(path)] ?? 'application/octet-stream',
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-embedder-policy': 'require-corp',
    })
    res.end(body)
  } catch {
    res.writeHead(404).end('nope')
  }
})
await new Promise((r) => server.listen(0, r))
const port = server.address().port

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
})
const page = await browser.newPage()
page.on('console', (m) => console.log('  [page]', m.text().slice(0, 300)))
await page.goto(`http://127.0.0.1:${port}/index.html?file=${encodeURIComponent(file)}`)
await page.waitForFunction('window.__done === true', null, { timeout: 180000 })
const pose = await page.evaluate('window.__pose')
if (pose.error) {
  console.error('POSE ERROR:', pose.error)
} else {
  await writeFile('pose-landmarks.json', JSON.stringify(pose, null, 2))
  console.log(`saved pose-landmarks.json  (${pose.landmarks.length} landmarks, image ${pose.width}x${pose.height})`)
  const NAMES = {
    0: 'nose', 7: 'ear_L', 8: 'ear_R',
    11: 'shoulder_L', 12: 'shoulder_R',
    13: 'elbow_L', 14: 'elbow_R',
    15: 'wrist_L', 16: 'wrist_R',
    19: 'index_L', 20: 'index_R',
    23: 'hip_L', 24: 'hip_R',
    25: 'knee_L', 26: 'knee_R',
    27: 'ankle_L', 28: 'ankle_R',
    31: 'foot_L', 32: 'foot_R',
  }
  console.log('\n  idx name         img_x   img_y    vis')
  for (const [i, name] of Object.entries(NAMES)) {
    const p = pose.landmarks[i]
    if (p) console.log(`  ${String(i).padStart(3)} ${name.padEnd(12)} ${p[0].toFixed(4)} ${p[1].toFixed(4)}  ${p[3].toFixed(3)}`)
  }
}
await browser.close()
server.close()
