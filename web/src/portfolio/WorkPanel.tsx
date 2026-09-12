import { useRef, useState } from 'react'
import { ArrowLeft, ArrowUpRight, Github, Sparkles } from 'lucide-react'
import jutsuImage from '../assets/projects/jutsu.webp'
import loihiImage from '../assets/projects/loihi.webp'
import { profile, projects, type Project } from '../lib/portfolio'
import type { MascotAction } from '../studio/rig'

type Props = {
  hidden: boolean
  canAsk: boolean
  onAction: (action: MascotAction) => void
  onAsk: (question: string) => Promise<void>
  onChat: () => void
}

const projectMedia: Record<string, { src: string; alt: string }> = {
  vision: {
    src: jutsuImage,
    alt: 'Reference chart of twelve Naruto-inspired hand signs',
  },
  loihi: {
    src: loihiImage,
    alt: 'Intel Loihi neuromorphic research chip',
  },
}

function projectQuestion(project: Project) {
  if (project.id === 'vision')
    return 'Tell me about your Naruto hand-sign recognition and AnimeGANv2 project'
  if (project.id === 'loihi')
    return 'Tell me about your event-camera visual-attention project with Lava and Loihi'
  return 'Tell me about this digital twin'
}

export default function WorkPanel({ hidden, canAsk, onAction, onAsk, onChat }: Props) {
  const [project, setProject] = useState<Project | null>(null)
  const panelRef = useRef<HTMLElement>(null)
  const media = project ? projectMedia[project.id] : undefined
  const showProject = (item: Project | null) => {
    panelRef.current?.scrollTo({ top: 0 })
    setProject(item)
  }

  return (
    <section ref={panelRef} className="console-section" hidden={hidden} aria-label="Selected work">
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

          <div className="work-sections">
            <section className="work-section" aria-labelledby="professional-work">
              <div className="work-section-heading">
                <span>01</span>
                <h3 id="professional-work">Professional</h3>
              </div>
              <div className="experience-list">
                {profile.experience.map((item) => (
                  <article className="experience-row" key={item.organization}>
                    <div>
                      <strong>{item.role}</strong>
                      <span>{item.period}</span>
                    </div>
                    <span className="micro-label">
                      {item.organization} / {item.location}
                    </span>
                    <p>{item.summary}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="work-section" aria-labelledby="personal-work">
              <div className="work-section-heading">
                <span>02</span>
                <h3 id="personal-work">Personal</h3>
              </div>
              <div className="project-list">
                {projects.map((item) => {
                  const itemMedia = projectMedia[item.id]
                  return (
                    <button
                      className="project-row"
                      key={item.id}
                      onClick={() => {
                        showProject(item)
                        onAction('present')
                      }}
                    >
                      {itemMedia ? (
                        <span className="project-thumbnail">
                          <img src={itemMedia.src} alt="" />
                        </span>
                      ) : (
                        <span className={`project-mark mark-${item.id}`}>c.</span>
                      )}
                      <span>
                        <span className="micro-label">{item.category}</span>
                        <strong>{item.name}</strong>
                        <span className="project-summary">{item.description}</span>
                        <span className="project-tags">{item.tags.join(' / ')}</span>
                      </span>
                      <ArrowUpRight size={18} />
                    </button>
                  )
                })}
              </div>
              <a className="text-link" href={profile.github} target="_blank" rel="noreferrer">
                <Github size={16} /> More on GitHub
                <ArrowUpRight size={15} />
              </a>
            </section>
          </div>
        </>
      ) : (
        <>
          <button className="back-link" onClick={() => showProject(null)}>
            <ArrowLeft size={15} /> All work
          </button>
          <div className="project-detail">
            <span className="micro-label">{project.category}</span>
            <h2>{project.name}</h2>
            {media ? (
              <figure className="project-hero">
                <img src={media.src} alt={media.alt} />
              </figure>
            ) : null}
            <p>{project.context}</p>
            <h3>The build</h3>
            <p>{project.approach}</p>
            <h3>Where it led</h3>
            <p>{project.outcome}</p>
            <div className="project-tags">{project.tags.join(' / ')}</div>
          </div>
          <button
            className="text-link"
            disabled={!canAsk}
            onClick={() => {
              onChat()
              void onAsk(projectQuestion(project))
            }}
          >
            <Sparkles size={16} /> Ask me about this
            <ArrowUpRight size={15} />
          </button>
        </>
      )}
    </section>
  )
}
