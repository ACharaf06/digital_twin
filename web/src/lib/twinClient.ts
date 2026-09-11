/**
 * Streams a reply from the digital-twin engine via POST /api/chat (SSE).
 *
 * Enabled by VITE_ENGINE_URL. The chat retains profile answers as a fallback.
 */
export type TwinEvent =
  | { delta: string }
  | { card: { title: string; subtitle: string; tags: string[] } }
  /** Documents the reply was grounded in, sent once before the first token. */
  | { sources: string[] }
  | { done: true }

export type Turn = { role: string; content: string }

const ENGINE_URL = import.meta.env.VITE_ENGINE_URL ?? '/api'

export async function* streamChat(
  message: string,
  history: Turn[] = [],
  signal?: AbortSignal,
): AsyncGenerator<TwinEvent> {
  const res = await fetch(`${ENGINE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
    signal,
  })
  if (!res.ok || !res.body) throw new Error(`engine ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      const frames = buffer.split(/\r?\n\r?\n/)
      buffer = frames.pop() ?? ''
      if (done && buffer.trim()) {
        frames.push(buffer)
        buffer = ''
      }
      for (const frame of frames) {
        const payload = frame
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n')
        if (!payload) continue
        const event = JSON.parse(payload) as TwinEvent
        yield event
        if ('done' in event && event.done) return
      }
      if (done) break
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
