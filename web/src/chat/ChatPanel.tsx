import { useEffect, useRef } from 'react'
import { ArrowUp, ArrowUpRight, FileText, RotateCcw, Square } from 'lucide-react'
import type { MascotAction, MascotMood } from '../studio/rig'
import type { Message } from './useTwinChat'

const suggestions: [string, string, MascotAction?][] = [
  ['What do you build?', 'Tell me about your work at Amadeus'],
  ['Something creative?', 'Tell me about your most creative project'],
  ['Your human story', 'Tell me about your background and education'],
  ['Surprise me', 'What surprised you most while building AI at Amadeus?', 'dance'],
]

const formatSources = (items: string[]) =>
  items.length < 3
    ? items.join(' and ')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

type Props = {
  hidden: boolean
  messages: Message[]
  input: string
  busy: boolean
  connection: string
  onInput: (value: string) => void
  onSend: (question: string, gesture?: MascotAction) => Promise<void>
  onStop: () => void
  onReset: () => void
  onMood: (mood: MascotMood) => void
}

export default function ChatPanel({
  hidden,
  messages,
  input,
  busy,
  connection,
  onInput,
  onSend,
  onStop,
  onReset,
  onMood,
}: Props) {
  const log = useRef<HTMLDivElement>(null)
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'instant' })
  }, [messages, hidden])

  return (
    <section className="console-chat" hidden={hidden} aria-label="Conversation">
      <div className="console-heading">
        <div>
          <span className="micro-label">NOT QUITE HUMAN. VERY MUCH ME.</span>
          <h2>
            Let's talk<span className="blue-period">.</span>
          </h2>
        </div>
        <button
          className="subtle-icon"
          title="Reset conversation"
          aria-label="Reset conversation"
          disabled={busy}
          onClick={onReset}
        >
          <RotateCcw size={16} />
        </button>
      </div>
      <div className="chat-log" ref={log} role="log" aria-live="polite" aria-busy={busy}>
        {messages.map((message) => (
          <div className={`chat-message message-${message.role}`} key={message.id}>
            <span className="message-author">
              {message.role === 'assistant' ? 'CHARAF / TWIN' : 'YOU'}
            </span>
            {message.content ? (
              <p>{message.content}</p>
            ) : (
              <span className="thinking-dots" aria-label="Thinking">
                <i />
                <i />
                <i />
              </span>
            )}
            {message.sources?.length ? (
              <p className="message-sources">
                <FileText size={12} aria-hidden="true" />
                <span>Grounded in {formatSources(message.sources)}</span>
              </p>
            ) : null}
          </div>
        ))}
      </div>
      {messages.length === 1 && (
        <div className="conversation-starters">
          {suggestions.map(([label, prompt, gesture]) => (
            <button key={label} onClick={() => void onSend(prompt, gesture)}>
              {label}
              <ArrowUpRight size={14} />
            </button>
          ))}
        </div>
      )}
      <form
        className="chat-composer"
        onSubmit={(event) => {
          event.preventDefault()
          void onSend(input)
        }}
      >
        <input
          id="twin-input"
          value={input}
          maxLength={2000}
          autoComplete="off"
          placeholder="Ask me anything..."
          aria-label="Ask Charaf's digital twin"
          onChange={(event) => onInput(event.target.value)}
          onFocus={() => {
            if (!busy) onMood('listening')
          }}
          onBlur={() => {
            if (!busy) onMood('idle')
          }}
        />
        {busy ? (
          <button type="button" className="send-button" aria-label="Stop reply" onClick={onStop}>
            <Square size={14} fill="currentColor" />
          </button>
        ) : (
          <button
            className="send-button"
            type="submit"
            disabled={!input.trim()}
            aria-label="Send message"
          >
            <ArrowUp size={19} />
          </button>
        )}
      </form>
      <div className="console-status">
        <span>
          <i className={connection === 'Live AI' ? 'connected' : ''} />
          {connection}
        </span>
        <span>AI twin. Real human behind it.</span>
      </div>
    </section>
  )
}
