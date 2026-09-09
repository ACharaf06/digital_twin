/**
 * Streams a reply from the digital-twin engine via POST /api/chat (SSE).
 *
 * NOT wired into the UI yet — DigitalTwin still uses the local scripted
 * getReply(). When the engine is running, swap the scripted call for this and
 * keep getReply() as the offline/fallback path.
 */
export type TwinEvent =
  | { delta: string }
  | { card: { title: string; subtitle: string; tags: string[] } }
  | { done: true }

export type Turn = { role: string; content: string }

const ENGINE_URL = import.meta.env.VITE_ENGINE_URL ?? '/api'

export async function* streamChat(
  message: string,
  history: Turn[] = [],
): AsyncGenerator<TwinEvent> {
  const res = await fetch(`${ENGINE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
  })
  if (!res.ok || !res.body) throw new Error(`engine ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      const line = frame.trim()
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload) yield JSON.parse(payload) as TwinEvent
    }
  }
}
