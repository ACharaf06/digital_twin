import { useCallback, useEffect, useRef, useState } from 'react'
import type { MascotAction, MascotMood } from '../studio/rig'
import { getLocalReply } from '../lib/portfolio'
import { checkEngine, streamChat } from '../lib/twinClient'

export type Message = {
  id: number
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
}

const welcome: Message = {
  id: 0,
  role: 'assistant',
  content: "Hey! I'm Charaf's digital twin. What's on your mind?",
}

type Options = {
  onMood: (mood: MascotMood) => void
  onAction: (action: MascotAction) => void
  onBubble: (text: string) => void
  voice: boolean
}

function scriptedReply(question: string, gesture?: MascotAction) {
  if (gesture === 'dance')
    return 'AI engineering by day. Questionable dance moves by... also day. My human is better at building things, I promise.'
  if (gesture) return 'A little personality goes a long way. Now, what shall we build?'
  return getLocalReply(question)
}

export function useTwinChat({ onMood, onAction, onBubble, voice }: Options) {
  const [messages, setMessages] = useState<Message[]>([welcome])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [connection, setConnection] = useState<
    'Checking connection' | 'Live AI' | 'Profile preview'
  >('Checking connection')
  const request = useRef<AbortController | null>(null)
  const serial = useRef(0)
  const sessionId = useRef(crypto.randomUUID())
  const voiceRef = useRef(voice)
  voiceRef.current = voice

  useEffect(() => {
    const controller = new AbortController()
    checkEngine(controller.signal)
      .then((ready) => setConnection(ready ? 'Live AI' : 'Profile preview'))
      .catch(() => {
        if (!controller.signal.aborted) setConnection('Profile preview')
      })
    return () => controller.abort()
  }, [])

  const stop = useCallback(() => {
    request.current?.abort()
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    onMood('idle')
  }, [onMood])

  useEffect(() => () => stop(), [stop])

  const reset = useCallback(() => {
    stop()
    sessionId.current = crypto.randomUUID()
    setMessages([welcome])
    setInput('')
  }, [stop])

  const send = useCallback(
    async (raw: string, gesture?: MascotAction) => {
      const question = raw.trim()
      if (!question || request.current) return
      const controller = new AbortController()
      request.current = controller
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
      const replyId = ++serial.current
      const history = messages
        .filter((message) => message.id !== 0 && message.content)
        .map(({ role, content }) => ({ role, content }))
      setMessages((current) => [
        ...current,
        { id: ++serial.current, role: 'user', content: question },
        { id: replyId, role: 'assistant', content: '' },
      ])
      setInput('')
      setBusy(true)
      onMood('thinking')
      onBubble('Let me think about that...')
      let answer = ''
      let streamed = false
      const update = (content: string) =>
        setMessages((current) =>
          current.map((message) => (message.id === replyId ? { ...message, content } : message)),
        )

      try {
        const typed = question.toLowerCase().match(/^(surprise me|dance|wave|jump|spin)[!.]?$/)?.[1]
        const play =
          gesture ??
          (typed ? (typed === 'surprise me' ? 'dance' : (typed as MascotAction)) : undefined)
        if (play) onAction(play)

        if (connection === 'Live AI') {
          try {
            for await (const event of streamChat(
              question,
              history,
              controller.signal,
              sessionId.current,
            )) {
              if ('sources' in event) {
                setMessages((current) =>
                  current.map((message) =>
                    message.id === replyId ? { ...message, sources: event.sources } : message,
                  ),
                )
              } else if ('delta' in event) {
                answer += event.delta
                streamed = true
                update(answer)
                onMood('speaking')
              }
            }
            if (!answer) throw new Error('Empty response')
          } catch (error) {
            if (controller.signal.aborted) throw error
            setConnection('Profile preview')
            answer = streamed
              ? `${answer}\n\nThe connection paused. You can reach the human through the contact tab.`
              : scriptedReply(question, play)
            streamed = false
          }
        } else answer = scriptedReply(question, play)

        if (!streamed) {
          onMood('speaking')
          const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
          if (reduced) update(answer)
          else {
            for (let index = 8; index < answer.length + 8; index += 8) {
              if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
              update(answer.slice(0, index))
              await new Promise((resolve) => window.setTimeout(resolve, 14))
            }
          }
        }
        onBubble('Your move, human.')
        if (voiceRef.current && 'speechSynthesis' in window && !controller.signal.aborted) {
          const utterance = new SpeechSynthesisUtterance(answer)
          utterance.rate = 1.05
          utterance.onend = () => {
            if (!request.current) onMood('idle')
          }
          utterance.onerror = () => {
            if (!request.current) onMood('idle')
          }
          window.speechSynthesis.cancel()
          window.speechSynthesis.speak(utterance)
        }
      } catch {
        if (!answer)
          update(
            controller.signal.aborted
              ? 'Paused. Take your time.'
              : 'I lost my train of thought. Try that again?',
          )
      } finally {
        if (request.current === controller) {
          request.current = null
          setBusy(false)
        }
        if (!('speechSynthesis' in window) || !window.speechSynthesis.speaking) onMood('idle')
      }
    },
    [connection, messages, onAction, onBubble, onMood],
  )

  return { messages, input, setInput, busy, connection, send, stop, reset }
}
