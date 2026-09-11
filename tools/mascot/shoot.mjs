// Multi-angle GLB screenshotter. usage: node shoot.mjs <glb-in-viewer-dir> <out-prefix> [--wire]
import { chromium } from '/Users/charafachir/projects/my_portfolio/web/node_modules/playwright/index.mjs'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

const file = process.argv[2] || 'model.glb'
const prefix = process.argv[3] || 'shot'
const wire = process.argv.includes('--wire') ? '1' : '0'
const dir = new URL('./viewer/', import.meta.url).pathname

const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.bin': 'application/octet-stream',
}
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(req.url.split('?')[0])
    const body = await readFile(join(dir, path === '/' ? 'index.html' : path))
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404).end('nope')
  }
})
await new Promise((r) => server.listen(0, r))
const port = server.address().port

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--use-angle=metal'],
})
const page = await browser.newPage({ viewport: { width: 900, height: 1100 } })
page.on('console', (m) => {
  if (m.type() === 'error') console.log('  [console]', m.text().slice(0, 200))
})

const views = [
  ['front', 0, 0.05, '5.2', '0.95'],
  ['three-quarter', -0.6, 0.08, '5.2', '0.95'],
  ['side', -1.5708, 0.05, '5.2', '0.95'],
  ['back', 3.1416, 0.05, '5.2', '0.95'],
  ['head', 0, 0.0, '0.95', '1.62'],
  ['head-side', -1.1, 0.0, '0.95', '1.62'],
]
let report = null
for (const [name, yaw, pitch, dist, ty] of views) {
  const url = `http://127.0.0.1:${port}/index.html?file=${encodeURIComponent(file)}&yaw=${yaw}&pitch=${pitch}&dist=${dist}&ty=${ty}&wire=${wire}`
  await page.goto(url)
  await page.waitForFunction('window.__ready === true', null, { timeout: 60000 })
  const err = await page.evaluate('window.__error || null')
  if (err) {
    console.error('LOAD ERROR:', err)
    break
  }
  report ??= await page.evaluate('window.__report')
  await page.waitForTimeout(450)
  const out = `${prefix}-${name}${wire === '1' ? '-wire' : ''}.png`
  await page.screenshot({ path: out })
  console.log('wrote', out)
}
if (report) console.log('\nreport:', JSON.stringify(report, null, 2).slice(0, 1200))
await browser.close()
server.close()
