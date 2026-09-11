import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowUp,
  ArrowUpRight,
  Check,
  Copy,
  FileText,
  Github,
  Linkedin,
  Mail,
  RotateCcw,
  Sparkles,
  Square,
} from 'lucide-react'
import { getLocalReply, profile, projects, type Project } from '../lib/portfolio'
import { streamChat } from '../lib/twinClient'
import type { MascotAction, MascotMood } from '../lib/mascot'

export type StudioView = 'chat' | 'work' | 'about'
type Message = {
  id: number
  role: 'user' | 'assistant'
  content: string
  /** Documents the engine grounded this reply in, e.g. ['my thesis']. */
  sources?: string[]
}
type Props = {
  view: StudioView
  onView: (view: StudioView) => void
  onMood: (mood: MascotMood) => void
  onAction: (action: MascotAction) => void
  onBubble: (text: string) => void
  voice: boolean
}
const welcome: Message = {
  id: 0,
  role: 'assistant',
  content: "Hey! I'm Charaf's digital twin. What's on your mind?",
}
// [button label, the question actually asked, optional gesture to play].
// Every one of these goes to the model like any typed question; the gesture is
// presentation, not a substitute for an answer.
const suggestions: [string, string, MascotAction?][] = [
  ['What do you build?', 'Tell me about your work at Amadeus'],
  ['Something creative?', 'Tell me about your most creative project'],
  ['Your human story', 'Tell me about your background and education'],
  // Anchored on purpose: an open "surprise me" invites a small model to invent,
  // while this reaches real material in the reports and stays grounded.
  ['Surprise me', 'What surprised you most while building AI at Amadeus?', 'dance'],
]

/** "a, b and c" rather than "a and b and c" once a reply cites three documents. */
const formatSources = (items: string[]) =>
  items.length < 3
    ? items.join(' and ')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

/**
 * Words for when there is no engine to write them. A requested gesture still
 * gets a line of its own; everything else falls back to the written profile.
 */
function scriptedReply(question: string, gesture?: MascotAction) {
  if (gesture === 'dance')
    return 'AI engineering by day. Questionable dance moves by... also day. My human is better at building things, I promise.'
  if (gesture) return 'A little personality goes a long way. Now, what shall we build?'
  return getLocalReply(question)
}

export default function TwinConsole({ view, onView, onMood, onAction, onBubble, voice }: Props) {
  const [messages, setMessages] = useState<Message[]>([welcome])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [connection, setConnection] = useState('Checking connection')
  const [project, setProject] = useState<Project | null>(null)
  const [copied, setCopied] = useState(false)
  const request = useRef<AbortController | null>(null)
  const serial = useRef(0)
  const log = useRef<HTMLDivElement>(null)
  const voiceRef = useRef(voice)
  voiceRef.current = voice

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${import.meta.env.VITE_ENGINE_URL ?? '/api'}/health`, { signal: AbortSignal.any([controller.signal,AbortSignal.timeout(5000)]) })
      .then((response) => response.json())
      .then((data) => setConnection(data.status === 'ready' ? 'Live AI' : 'Profile preview'))
      .catch(() => {
        if (!controller.signal.aborted) setConnection('Profile preview')
      })
    return () => controller.abort()
  }, [])
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'instant' })
  }, [messages, view])
  useEffect(
    () => () => {
      request.current?.abort()
    },
    [],
  )

  function stop() {
    request.current?.abort()
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    onMood('idle')
  }

  async function send(raw: string, gesture?: MascotAction) {
    const question = raw.trim()
    if (!question || request.current) return
    const controller = new AbortController()
    request.current = controller
    if('speechSynthesis' in window)window.speechSynthesis.cancel()
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
      // Typing "dance" or "wave" still plays the gesture, and so does a starter
      // that carries one. The gesture is fired either way; only the words are
      // scripted, and only when there is no engine to write them.
      const typed = question.toLowerCase().match(/^(surprise me|dance|wave|jump|spin)[!.]?$/)?.[1]
      const play =
        gesture ??
        (typed ? (typed === 'surprise me' ? 'dance' : (typed as MascotAction)) : undefined)
      if (play) onAction(play)

      if (connection === 'Live AI') {
        try {
          for await (const event of streamChat(question, history, controller.signal)) {
            if ('sources' in event) {
              const { sources } = event
              setMessages((current) =>
                current.map((message) =>
                  message.id === replyId ? { ...message, sources } : message,
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
          if (streamed)
            answer += '\n\nThe connection paused. You can reach the human through the contact tab.'
          else answer = scriptedReply(question, play)
          streamed = false
        }
      } else answer = scriptedReply(question, play)

      if (!streamed) {
        onMood('speaking')
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        if (reduced) update(answer)
        else
          for (let index = 8; index < answer.length + 8; index += 8) {
            if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
            update(answer.slice(0, index))
            await new Promise((resolve) => window.setTimeout(resolve, 14))
          }
      }
      onBubble('Your move, human.')
      if (voiceRef.current && 'speechSynthesis' in window && !controller.signal.aborted) {
        const utterance = new SpeechSynthesisUtterance(answer)
        utterance.rate = 1.05
        utterance.onend = () => {if(!request.current)onMood('idle')}
        utterance.onerror = () => {if(!request.current)onMood('idle')}
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
  }

  return (
    <div className="twin-console">
      <section className="console-chat" hidden={view !== 'chat'} aria-label="Conversation">
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
            onClick={() => {
              stop()
              setMessages([welcome])
              setInput('')
            }}
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
              <button key={label} onClick={() => void send(prompt, gesture)}>
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
            void send(input)
          }}
        >
          <input
            id="twin-input"
            value={input}
            maxLength={2000}
            autoComplete="off"
            placeholder="Ask me anything..."
            aria-label="Ask Charaf's digital twin"
            onChange={(event) => setInput(event.target.value)}
            onFocus={() => {
              if (!busy) onMood('listening')
            }}
            onBlur={() => {
              if (!busy) onMood('idle')
            }}
          />
          {busy ? (
            <button type="button" className="send-button" aria-label="Stop reply" onClick={stop}>
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
      <section className="console-section" hidden={view !== 'work'} aria-label="Selected work">
        {!project ? (
          <>
            <div className="console-heading">
              <div>
                <span className="micro-label">FROM CURIOSITY TO CODE</span>
                <h2>
                  Things I've built<span className="blue-period">.</span>
                </h2>
              </div>
            </div>
            <div className="project-list">
              {projects.map((item) => (
                <button
                  className="project-row"
                  key={item.id}
                  onClick={() => {
                    setProject(item)
                    onAction('present')
                  }}
                >
                  <span className={`project-mark mark-${item.id}`}>
                    {item.id === 'agent' ? '{ }' : item.id === 'vision' ? '[ : ]' : 'c.'}
                  </span>
                  <span>
                    <span className="micro-label">{item.category}</span>
                    <strong>{item.name}</strong>
                    <span className="project-summary">{item.description}</span>
                    <span className="project-tags">{item.tags.join(' / ')}</span>
                  </span>
                  <ArrowUpRight size={18} />
                </button>
              ))}
            </div>
            <a className="text-link" href={profile.github} target="_blank" rel="noreferrer">
              <Github size={16} /> More on GitHub
              <ArrowUpRight size={15} />
            </a>
          </>
        ) : (
          <>
            <button className="back-link" onClick={() => setProject(null)}>
              <ArrowLeft size={15} /> All projects
            </button>
            <div className="project-detail">
              <span className="micro-label">{project.category}</span>
              <h2>{project.name}</h2>
              <p>{project.context}</p>
              <h3>The build</h3>
              <p>{project.approach}</p>
              <h3>Where it led</h3>
              <p>{project.outcome}</p>
              <div className="project-tags">{project.tags.join(' / ')}</div>
            </div>
            <button
              className="text-link"
              onClick={() => {
                onView('chat')
                void send(
                  `Tell me about ${project.id === 'agent' ? 'your Amadeus work' : project.id === 'vision' ? 'your anime computer vision project' : 'this digital twin'}`,
                )
              }}
            >
              <Sparkles size={16} /> Ask me about this
              <ArrowUpRight size={15} />
            </button>
          </>
        )}
      </section>
      <section className="console-section" hidden={view !== 'about'} aria-label="About Charaf">
        <div className="console-heading">
          <div>
            <span className="micro-label">THE PERSON BEHIND THE POLYGONS</span>
            <h2>
              Charaf Achir<span className="blue-period">.</span>
            </h2>
          </div>
        </div>
        <div className="human-story">
          <p className="story-lead">
            An AI engineer. A curious mind.
            <br />A builder at heart.
          </p>
          <p>
            I turn ideas into applied AI: conversational systems, computer vision, and the
            occasional experiment that makes you smile.
          </p>
          <div className="story-timeline">
            <div>
              <span>NOW</span>
              <p>
                Applied GenAI at <strong>Amadeus</strong>
              </p>
            </div>
            <div>
              <span>2025-26</span>
              <p>
                Big Data specialized master
                <br />
                <strong>GEM & ENSIMAG</strong>
              </p>
            </div>
            <div>
              <span>BEFORE</span>
              <p>
                Data Science engineering, Polytech Nice-Sophia. NLP and ML at Inria. Applied AI at
                SaaSOffice.
              </p>
            </div>
          </div>
          <span className="micro-label">LET'S MAKE SOMETHING MATTER</span>
          <div className="contact-email">
            <a href={`mailto:${profile.email}`}>
              <Mail size={16} />
              {profile.email}
            </a>
            <button
              className="subtle-icon"
              title={copied ? 'Email copied' : 'Copy email'}
              aria-label={copied ? 'Email copied' : 'Copy email'}
              onClick={() =>
                void navigator.clipboard
                  .writeText(profile.email)
                  .then(() => setCopied(true))
                  .catch(() => onBubble(`Email: ${profile.email}`))
              }
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </button>
          </div>
          <div className="social-links">
            <a href={profile.linkedin} target="_blank" rel="noreferrer">
              <Linkedin size={17} /> LinkedIn
              <ArrowUpRight size={14} />
            </a>
            <a href={profile.github} target="_blank" rel="noreferrer">
              <Github size={17} /> GitHub
              <ArrowUpRight size={14} />
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
