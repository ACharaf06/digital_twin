import { useEffect, useRef, useState } from 'react'

/* Edit these when you're ready to point recruiters at the real you. */
const CONTACT = {
  email: 'hello@mainframe.co',
  linkedin: 'linkedin.com/in/charaf-achir',
}

type Card = {
  title: string
  subtitle: string
  tags: string[]
}

type Reply = { text: string; card?: Card }

type Message = {
  id: number
  role: 'twin' | 'user'
  text: string
  card?: Card
}

const OPENING =
  "I'm Charaf's digital twin, running on A.R.I.A. He's an applied-AI engineer — GenAI Developer at Amadeus, wrapping up a Big Data MS at GEM x ENSIMAG. Ask me about his work, his stack, his projects, or how to reach him."

const SUGGESTIONS = [
  'What do you do at Amadeus?',
  'Show me a standout project',
  "What's your stack?",
  'Are you available to hire?',
]

const ANIME_CARD: Card = {
  title: 'Live Anime Style Transfer',
  subtitle: 'Real-time webcam anime filter, switched with Naruto hand-signs.',
  tags: ['AnimeGANv2', 'PyTorch / MPS', 'MediaPipe', 'Real-time'],
}

const CHATBOT_CARD: Card = {
  title: 'LCP Configuration Chatbot',
  subtitle: "RAG + function-calling assistant for Amadeus' loyalty platform.",
  tags: ['RAG', 'Function calling', 'LangGraph', 'Azure OpenAI'],
}

function getReply(raw: string): Reply {
  const q = raw.toLowerCase()
  const has = (...k: string[]) => k.some((w) => q.includes(w))

  if (has('amadeus', 'work on', 'do at', 'current', 'octomind', 'your job'))
    return {
      text:
        'At Amadeus I build GenAI for LCP, their loyalty platform. I shipped a configuration-chatbot POC solo — RAG over the product docs, then a hybrid setup with code-generated docs and function calling — and demoed it to clients through the winter. It landed well enough that the use cases earned their own team, OctoMind, to take them toward production. I now work on two of them: Member Insight and that chatbot.',
      card: CHATBOT_CARD,
    }

  if (has('project', 'standout', 'best', 'portfolio', 'built', 'show me', 'cool', 'impress'))
    return {
      text:
        'My favourite is a creative one: real-time anime style transfer over a live webcam, with Naruto hand-signs to switch modes — AnimeGANv2 in PyTorch on Apple Silicon, MediaPipe for the hand landmarks. Pure visual-wow engineering. On the serious side, the Amadeus configuration chatbot is the one with real users behind it.',
      card: ANIME_CARD,
    }

  if (has('stack', 'skill', 'tech', 'tool', 'language', 'framework', 'llm'))
    return {
      text:
        'Applied AI, end to end: LLM apps — RAG, function calling, agents with LangChain and LangGraph — on Azure OpenAI and AI Foundry, LiteLLM for routing, Langfuse for observability. Python-first, with a real data-science foundation underneath. I care about the whole chain: prototype, deploy, test, observe — not just the model.',
    }

  if (has('available', 'hire', 'hiring', 'recruit', 'cdi', 'looking', 'join', 'opportunit', 'position'))
    return {
      text:
        "The Amadeus apprenticeship runs to September 2026, so I'm open to a permanent role from then — ideally AI Engineer / AI Specialist covering the full applied-AI chain, not just the model. Happy to talk sooner. The fastest way to reach the human version is right below.",
    }

  if (has('study', 'studies', 'school', 'education', 'degree', 'universit', 'master', 'msc'))
    return {
      text:
        'Right now: a Big Data MS at Grenoble École de Management with ENSIMAG (2025–2026). Before that, an engineering degree in Data Science at Polytech Nice-Sophia, and a MIASHS licence at Université Grenoble Alpes. Two internships along the way — NLP & ML at Inria, and AI engineering at a SaaS startup.',
    }

  if (has('contact', 'email', 'reach', 'linkedin', 'cv', 'resume', 'touch', 'connect'))
    return {
      text: `Easiest: ${CONTACT.email}, or find the real Charaf on LinkedIn (${CONTACT.linkedin}). Want me to point you to a specific project or his CV?`,
    }

  if (has('who', 'about', 'yourself', 'your name', 'hello', 'hey', ' hi', 'salut', 'bonjour'))
    return {
      text:
        "I'm the applied-AI half of Charaf — the part that takes an idea from prototype to something that actually ships. These days that's GenAI at Amadeus while finishing a Big Data MS in Grenoble. Ask me about the work, the stack, or how to reach him.",
    }

  return {
    text:
      "I'm a front-end preview of Charaf's digital twin, so for now I answer from a fixed script — the live version is on the way. Try a suggestion below, or ask about his work, stack, projects, studies, or how to reach him.",
  }
}

let _id = 0
const uid = () => ++_id
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  )
}

function ProjectCard({ card }: { card: Card }) {
  return (
    <div className="mt-2 rounded-xl border border-white/12 bg-white/5 p-3" style={{ animation: 'messageIn 0.4s ease both' }}>
      <div className="text-[13px] text-white" style={{ fontFamily: 'var(--font-heading)' }}>
        {card.title}
      </div>
      <div className="text-[12px] text-white/55 mt-0.5 leading-snug">{card.subtitle}</div>
      <div className="flex flex-wrap gap-1 mt-2">
        {card.tags.map((t) => (
          <span key={t} className="text-[10.5px] text-cyan-100/80 bg-cyan-300/10 border border-cyan-200/20 rounded-md px-1.5 py-[2px]">
            {t}
          </span>
        ))}
      </div>
    </div>
  )
}

function MessageRow({ m }: { m: Message }) {
  const isTwin = m.role === 'twin'
  return (
    <div className={`flex ${isTwin ? 'justify-start' : 'justify-end'}`} style={{ animation: 'messageIn 0.35s ease both' }}>
      <div className={`flex gap-2 max-w-[86%] ${isTwin ? '' : 'flex-row-reverse'}`}>
        {isTwin && (
          <img src="/avatar.png" alt="" className="w-7 h-7 rounded-full object-cover mt-0.5 shrink-0 ring-1 ring-white/15" />
        )}
        <div className="min-w-0">
          {(m.text || !isTwin) && (
            <div
              className={`text-[13.5px] leading-relaxed px-3.5 py-2.5 ${
                isTwin ? 'bg-white/8 text-white/90 rounded-2xl rounded-tl-md' : 'bg-white text-black rounded-2xl rounded-tr-md'
              }`}
            >
              {m.text}
            </div>
          )}
          {m.card && <ProjectCard card={m.card} />}
        </div>
      </div>
    </div>
  )
}

function TypingRow() {
  return (
    <div className="flex justify-start" style={{ animation: 'messageIn 0.3s ease both' }}>
      <div className="flex gap-2">
        <img src="/avatar.png" alt="" className="w-7 h-7 rounded-full object-cover mt-0.5 ring-1 ring-white/15" />
        <div className="bg-white/8 rounded-2xl rounded-tl-md px-3.5 py-3 flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-1.5 h-1.5 rounded-full bg-white/60" style={{ animation: `typingDot 1s ${i * 0.15}s infinite` }} />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function DigitalTwin() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const startedRef = useRef(false)
  const busyRef = useRef(false)

  async function streamTwin(reply: Reply, thinkMs = 600) {
    setIsTyping(true)
    await sleep(thinkMs)
    setIsTyping(false)
    const id = uid()
    setMessages((m) => [...m, { id, role: 'twin', text: '' }])
    const { text, card } = reply
    const step = text.length > 150 ? 2 : 1
    for (let i = step; i <= text.length; i += step) {
      const slice = text.slice(0, i)
      setMessages((m) => m.map((msg) => (msg.id === id ? { ...msg, text: slice } : msg)))
      await sleep(12)
    }
    setMessages((m) => m.map((msg) => (msg.id === id ? { ...msg, text } : msg)))
    if (card) {
      await sleep(180)
      setMessages((m) => m.map((msg) => (msg.id === id ? { ...msg, card } : msg)))
    }
  }

  async function send(textRaw: string) {
    const text = textRaw.trim()
    if (!text || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setInput('')
    setMessages((m) => [...m, { id: uid(), role: 'user', text }])
    await streamTwin(getReply(text))
    busyRef.current = false
    setBusy(false)
  }

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    ;(async () => {
      busyRef.current = true
      setBusy(true)
      await streamTwin({ text: OPENING }, 850)
      busyRef.current = false
      setBusy(false)
    })()
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, isTyping])

  return (
    <div className="relative w-full max-w-[420px]">
      {/* animated AI aura */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-6 rounded-[2rem] opacity-40 blur-2xl"
        style={{
          background: 'conic-gradient(from 180deg, #67e8f9, #818cf8, #f0abfc, #67e8f9)',
          animation: 'auraSpin 16s linear infinite',
        }}
      />

      {/* glass panel */}
      <div
        className="relative rounded-[1.6rem] border border-white/12 bg-black/45 backdrop-blur-2xl shadow-2xl overflow-hidden"
        style={{ animation: 'panelIn 0.7s ease both' }}
      >
        {/* header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
          <div className="relative shrink-0">
            <img src="/avatar.png" alt="Charaf" className="w-11 h-11 rounded-full object-cover" />
            <span
              className="absolute -inset-0.5 rounded-full ring-2 ring-cyan-300/40"
              style={{ animation: 'twinPulse 2.4s ease-in-out infinite' }}
            />
            <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-black/70" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[15px] text-white" style={{ fontFamily: 'var(--font-heading)' }}>
                Charaf
              </span>
              <span className="text-[10px] uppercase tracking-wider text-cyan-200/80 border border-cyan-200/30 rounded-full px-1.5 py-[1px]">
                Digital twin
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[12px] text-white/50">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ animation: 'twinPulse 2s infinite' }} />
              online · powered by A.R.I.A
            </div>
          </div>
        </div>

        {/* messages */}
        <div ref={scrollRef} className="px-4 py-4 space-y-3 overflow-y-auto h-[270px] sm:h-[320px]">
          {messages.map((m) => (
            <MessageRow key={m.id} m={m} />
          ))}
          {isTyping && <TypingRow />}
        </div>

        {/* suggestion chips */}
        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              disabled={busy}
              onClick={() => send(s)}
              className="text-[12px] text-white/80 border border-white/15 rounded-full px-3 py-1 hover:bg-white hover:text-black transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-white/80"
            >
              {s}
            </button>
          ))}
        </div>

        {/* input */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            send(input)
          }}
          className="flex items-center gap-2 px-3 py-3 border-t border-white/10"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask my digital twin…"
            className="flex-1 min-w-0 bg-white/5 text-white placeholder-white/35 text-[14px] rounded-full px-4 py-2 outline-none border border-white/10 focus:border-cyan-200/40 transition-colors"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="shrink-0 w-9 h-9 rounded-full bg-white text-black flex items-center justify-center hover:bg-cyan-200 transition-colors disabled:opacity-40"
          >
            <SendIcon />
          </button>
        </form>
      </div>
    </div>
  )
}
