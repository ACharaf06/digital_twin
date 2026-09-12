import { useCallback, useEffect, useRef, useState } from 'react'
import type { MascotAction, MascotMood } from '../studio/rig'
import { checkEngine, streamChat } from '../lib/twinClient'

export type Message = {
  id: number
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
}

export type Connection = 'Checking connection' | 'Live AI' | 'AI unavailable'

type Options = {
  onMood: (mood: MascotMood) => void
  onAction: (action: MascotAction) => void
  onBubble: (text: string) => void
  voice: boolean
}

export function useTwinChat({ onMood, onAction, onBubble, voice }: Options) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [connection, setConnection] = useState<Connection>('Checking connection')
  const request = useRef<AbortController | null>(null)
  const serial = useRef(0)
  const sessionId = useRef(crypto.randomUUID())
  const voiceRef = useRef(voice)
  voiceRef.current = voice

  useEffect(() => {
    let disposed = false
    const refresh = () => {
      void checkEngine()
        .then((ready) => {
          if (!disposed) setConnection(ready ? 'Live AI' : 'AI unavailable')
        })
        .catch(() => {
          if (!disposed) setConnection('AI unavailable')
        })
    }
    refresh()
    const timer = window.setInterval(refresh, 15_000)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
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
    setMessages([])
    setInput('')
  }, [stop])

  const send = useCallback(
    async (raw: string, gesture?: MascotAction) => {
      const question = raw.trim()
      if (!question || request.current || connection !== 'Live AI') return

      const controller = new AbortController()
      request.current = controller
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
      const replyId = ++serial.current
      const history = messages.map(({ role, content }) => ({ role, content }))
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
      const update = (content: string) =>
        setMessages((current) =>
          current.map((message) => (message.id === replyId ? { ...message, content } : message)),
        )
      const removeEmptyReply = () =>
        setMessages((current) => current.filter((message) => message.id !== replyId))

      try {
        const typed = question.toLowerCase().match(/^(surprise me|dance|wave|jump|spin)[!.]?$/)?.[1]
        const play =
          gesture ??
          (typed ? (typed === 'surprise me' ? 'dance' : (typed as MascotAction)) : undefined)
        if (play) onAction(play)

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
              update(answer)
              onMood('speaking')
            }
          }
        } catch (error) {
          if (controller.signal.aborted) throw error
          setConnection('AI unavailable')
          if (!answer) removeEmptyReply()
          return
        }

        if (!answer) {
          setConnection('AI unavailable')
          removeEmptyReply()
          return
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
        if (!answer) removeEmptyReply()
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
