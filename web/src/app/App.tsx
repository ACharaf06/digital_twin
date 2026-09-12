import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowUp,
  ArrowUpRight,
  Asterisk,
  BriefcaseBusiness,
  GraduationCap,
  Hand,
  MessageCircle,
  Music2,
  Rotate3D,
  RotateCcw,
  ScanFace,
  UserRound,
  Volume2,
  VolumeX,
} from 'lucide-react'
import TwinConsole, { type StudioView } from '../components/TwinConsole'
import type { MascotAction, MascotMood } from '../studio/rig'
import type { StageAction } from '../studio/MascotStage'
import { profile } from '../lib/portfolio'

const MascotStage = lazy(() => import('../studio/MascotStage'))
const moodLabels: Record<MascotMood, string> = {
  idle: 'A little code. A lot of personality.',
  listening: "I'm all ears.",
  thinking: 'Connecting a few dots...',
  speaking: 'Now, where were we?',
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [entered, setEntered] = useState(false)
  const [view, setView] = useState<StudioView>('chat')
  const [mood, setMood] = useState<MascotMood>('idle')
  const [action, setAction] = useState<StageAction>({ name: 'wave', id: 0 })
  const [voice, setVoice] = useState(false)
  const [wireframe, setWireframe] = useState(false)
  const [bubble, setBubble] = useState('Oh, hey there!')
  const bubbleTimer = useRef<number>()
  const onReady = useCallback(() => setReady(true), [])
  const showBubble = useCallback((text: string) => {
    setBubble(text)
    window.clearTimeout(bubbleTimer.current)
    bubbleTimer.current = window.setTimeout(() => setBubble(''), 4000)
  }, [])
  const perform = useCallback(
    (name: MascotAction) => {
      setAction((current) => ({ name, id: current.id + 1 }))
      const words: Partial<Record<MascotAction, string>> = {
        wave: 'Hey, human!',
        dance: 'My other skill? Questionable dance moves.',
        jump: 'A small leap of imagination.',
        spin: 'Yes, I have a back, too.',
        reset: 'Back to you.',
        present: 'Let me show you something.',
      }
      showBubble(words[name] || '')
    },
    [showBubble],
  )
  const onInteraction = useCallback(
    (target: string) => {
      if (target === 'laptop') {
        setView('work')
        perform('present')
      } else if (target === 'toy') perform('dance')
      else if (target === 'hand') perform('wave')
      else if (target === 'head') {
        perform('jump')
        showBubble('Okay, that tickles.')
      } else perform('wave')
    },
    [perform, showBubble],
  )

  useEffect(() => {
    if (!ready) return
    const timer = window.setTimeout(() => setEntered(true), 2600)
    return () => window.clearTimeout(timer)
  }, [ready])
  useEffect(() => {
    document
      .querySelectorAll<HTMLElement>(
        '.studio-header,.conversation-space,.mascot-tools,.studio-footer',
      )
      .forEach((element) => {
        element.inert = !entered
      })
  }, [entered])
  useEffect(
    () => () => {
      window.clearTimeout(bubbleTimer.current)
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    },
    [],
  )

  return (
    <main className={`twin-studio ${entered ? 'has-entered' : 'is-booting'}`}>
      <a
        className="skip-link"
        href="#twin-input"
        onClick={() => {
          setEntered(true)
          setView('chat')
        }}
      >
        Skip to conversation
      </a>
      <div className="stage-layer">
        <Suspense fallback={null}>
          <MascotStage
            entered={entered}
            mood={mood}
            action={action}
            wireframe={wireframe}
            onReady={onReady}
            onInteraction={onInteraction}
          />
        </Suspense>
      </div>
      <div className="studio-grain" aria-hidden="true" />
      <header className="studio-header">
        <a
          className="studio-brand"
          href="#"
          onClick={(event) => {
            event.preventDefault()
            setView('chat')
            perform('reset')
          }}
        >
          <Asterisk size={29} strokeWidth={2} />
          <span>
            {profile.shortName.toLowerCase()}
            <span className="brand-period">.</span>
          </span>
          <span className="brand-caption">
            HUMAN.
            <br />
            DIGITAL.
          </span>
        </a>
        <div className="studio-location">
          <span className="live-dot" /> FROM {profile.location.toUpperCase()}, WITH CURIOSITY
        </div>
        <button
          className={`sound-control ${voice ? 'is-on' : ''}`}
          aria-label={voice ? 'Turn voice off' : 'Turn voice on'}
          aria-pressed={voice}
          onClick={() => {
            setVoice((value) => !value)
            if (voice && 'speechSynthesis' in window) window.speechSynthesis.cancel()
          }}
          title={voice ? 'Voice on' : 'Voice off'}
        >
          {voice ? <Volume2 size={18} /> : <VolumeX size={18} />}
          <span>Voice {voice ? 'on' : 'off'}</span>
        </button>
      </header>
      <div className="scene-intro">
        <span className="micro-label">{profile.role.toUpperCase()} / DIGITAL ALTER EGO</span>
        <h1>
          {profile.name}
          <span className="blue-period">.</span>
          <br />
          <em>Human, mostly.</em>
        </h1>
        <span className="intro-aside">
          Same curiosity.
          <br />A few extra polygons.
        </span>
      </div>
      <div className={`mascot-bubble ${bubble ? 'is-visible' : ''}`} role="status">
        <span>{bubble}</span>
        <i />
      </div>
      <div className="mascot-caption">
        <span className="caption-cross">+</span>
        <span>
          {profile.name.toUpperCase()}
          <span>{moodLabels[mood]}</span>
        </span>
      </div>
      <aside className="conversation-space" aria-label="Charaf's digital twin">
        <nav className="studio-tabs" aria-label="Explore Charaf's world">
          {(
            [
              { id: 'chat', label: 'The twin', icon: MessageCircle },
              { id: 'work', label: 'My work', icon: BriefcaseBusiness },
              { id: 'studies', label: 'Studies', icon: GraduationCap },
              { id: 'about', label: 'The human', icon: UserRound },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              className={view === tab.id ? 'is-active' : ''}
              aria-pressed={view === tab.id}
              onClick={() => {
                setView(tab.id)
                if (tab.id === 'work') perform('present')
              }}
            >
              <tab.icon size={15} />
              {tab.label}
            </button>
          ))}
        </nav>
        <TwinConsole
          view={view}
          onView={setView}
          onMood={setMood}
          onAction={perform}
          onBubble={showBubble}
          voice={voice}
        />
      </aside>
      <div className="mascot-tools" role="group" aria-label="Interact with Charaf">
        {(
          [
            { name: 'wave', label: 'Say hello', icon: Hand },
            { name: 'dance', label: 'Dance break', icon: Music2 },
            { name: 'jump', label: 'A little jump', icon: ArrowUp },
            { name: 'spin', label: 'Take a spin', icon: Rotate3D },
            { name: 'reset', label: 'Reset view', icon: RotateCcw },
          ] as const
        ).map((tool) => (
          <button key={tool.name} aria-label={tool.label} onClick={() => perform(tool.name)}>
            <tool.icon size={19} strokeWidth={1.65} />
            <span className="tool-tip">{tool.label}</span>
          </button>
        ))}
        <button
          className={wireframe ? 'is-active' : ''}
          aria-label="See the geometry"
          aria-pressed={wireframe}
          onClick={() => {
            setWireframe((current) => !current)
            showBubble(
              wireframe ? 'Back in human color.' : 'Underneath it all? A lot of triangles.',
            )
          }}
        >
          <ScanFace size={19} strokeWidth={1.65} />
          <span className="tool-tip">See the geometry</span>
        </button>
      </div>
      <footer className="studio-footer">
        <span>
          <span className="live-dot" />{' '}
          {mood === 'thinking' ? 'THINKING' : mood === 'speaking' ? 'SPEAKING' : 'HERE, WITH YOU'}
        </span>
        <span className="footer-note">A PERSONAL EXPERIMENT BY CHARAF ACHIR</span>
        <a href={`mailto:${profile.email}`}>
          Reach the human <ArrowUpRight size={15} />
        </a>
      </footer>
      {!entered && (
        <div className={`boot-screen ${ready ? 'is-ready' : ''}`} aria-live="polite">
          <div className="boot-top">
            <Asterisk size={27} />
            <span>{profile.shortName.toUpperCase()} / DIGITAL TWIN</span>
          </div>
          <div className="boot-title">
            <span>{ready ? 'OH. THERE YOU ARE.' : 'A HUMAN IS TAKING SHAPE.'}</span>
            <h2>
              Hello,
              <br />
              <em>human.</em>
            </h2>
          </div>
          <div className="boot-bottom">
            <div>
              <span>
                {ready ? 'PERSONALITY: LOADED' : 'A LITTLE INTELLIGENCE. A LOT OF CURIOSITY.'}
              </span>
              <div className="boot-progress">
                <i style={{ width: ready ? '100%' : '32%' }} />
              </div>
            </div>
            <button disabled={!ready} onClick={() => setEntered(true)}>
              {ready ? 'Come on in' : 'Waking up'} <ArrowUpRight size={21} />
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
