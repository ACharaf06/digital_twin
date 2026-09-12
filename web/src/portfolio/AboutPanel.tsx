import { useState } from 'react'
import {
  ArrowUpRight,
  Check,
  Copy,
  Film,
  Gamepad2,
  Github,
  Linkedin,
  Mail,
  Music2,
  Plane,
  Trophy,
  Zap,
} from 'lucide-react'
import { profile } from '../lib/portfolio'
import type { MascotAction } from '../studio/rig'

type Props = {
  hidden: boolean
  onAction: (action: MascotAction) => void
  onBubble: (text: string) => void
}

const interestIcons = {
  football: Trophy,
  dj: Music2,
  gaming: Gamepad2,
  marvel: Zap,
} as const

const interestActions: Record<string, MascotAction> = {
  football: 'jump',
  dj: 'dance',
  gaming: 'present',
  marvel: 'spin',
}

const curiosityIcons = {
  skydiving: Plane,
  gta6: Gamepad2,
  doomsday: Film,
} as const

function InterestVisual({ id }: { id: string }) {
  if (id === 'football')
    return (
      <div className="football-pitch" aria-hidden="true">
        <span className="pitch-circle" />
        <span className="football-ball" />
        <strong>KTH</strong>
        <small>DIV. 6 / SWEDEN</small>
      </div>
    )

  if (id === 'dj')
    return (
      <div className="dj-deck" aria-hidden="true">
        <span className="vinyl-record">
          <i />
        </span>
        <span className="tone-arm" />
        <span className="equalizer">
          {Array.from({ length: 8 }, (_, index) => (
            <i key={index} />
          ))}
        </span>
        <small>LIVE / AFTER DARK</small>
      </div>
    )

  if (id === 'gaming')
    return (
      <div className="game-screen" aria-hidden="true">
        <span>FIFA 21</span>
        <Gamepad2 size={46} strokeWidth={1.4} />
        <strong>SEMI-FINALIST</strong>
        <small>MOROCCO</small>
      </div>
    )

  return (
    <div className="marvel-reactor" aria-hidden="true">
      <span className="reactor-ring">
        <i />
      </span>
      <strong>THE FIRST SPARK</strong>
      <small>ENGINEERING, ASSEMBLE.</small>
    </div>
  )
}

export default function AboutPanel({ hidden, onAction, onBubble }: Props) {
  const [copied, setCopied] = useState(false)
  const [interestId, setInterestId] = useState(profile.human.interests[0].id)
  const interest =
    profile.human.interests.find((item) => item.id === interestId) ?? profile.human.interests[0]

  return (
    <section className="console-section" hidden={hidden} aria-label={`About ${profile.name}`}>
      <div className="console-heading human-heading">
        <div>
          <span className="micro-label">THE PERSON BEHIND THE POLYGONS</span>
          <h2>
            Human, definitely<span className="blue-period">.</span>
          </h2>
        </div>
      </div>

      <p className="human-intro">{profile.human.intro}</p>

      <div className="human-selector" role="group" aria-label="Explore Charaf beyond work">
        {profile.human.interests.map((item) => {
          const Icon = interestIcons[item.id as keyof typeof interestIcons]
          return (
            <button
              className={interest.id === item.id ? 'is-active' : ''}
              key={item.id}
              aria-pressed={interest.id === item.id}
              onClick={() => {
                setInterestId(item.id)
                onAction(interestActions[item.id] ?? 'present')
                onBubble(item.bubble)
              }}
            >
              <Icon size={15} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>

      <article className="human-feature" key={interest.id}>
        <div className="human-visual">
          <InterestVisual id={interest.id} />
        </div>
        <div className="human-feature-copy">
          <span className="micro-label">{interest.marker}</span>
          <h3>{interest.label}</h3>
          <p>{interest.story}</p>
        </div>
      </article>

      <section className="human-side-quests" aria-labelledby="side-quests-title">
        <span className="micro-label">CURRENTLY CURIOUS ABOUT</span>
        <h3 id="side-quests-title">Current side quests.</h3>
        <div className="curiosity-grid">
          {profile.human.curiosities.map((item) => {
            const Icon = curiosityIcons[item.id as keyof typeof curiosityIcons]
            return (
              <article className={`curiosity-card curiosity-${item.id}`} key={item.id}>
                <Icon size={18} />
                <strong>{item.label}</strong>
                <p>{item.note}</p>
              </article>
            )
          })}
        </div>
      </section>

      <div className="human-contact">
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

      <p className="chat-privacy">
        About the chat: what you type goes to OpenAI to write the answer, and to Langfuse, which
        keeps a trace of the exchange for 30 days so I can see how the twin is doing. Nothing is
        stored here, there is no account, and the twin cannot contact anyone on my behalf.
      </p>
    </section>
  )
}
