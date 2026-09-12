import { useState } from 'react'
import { ArrowLeft, ArrowUpRight, Github, Sparkles } from 'lucide-react'
import type { MascotAction } from '../studio/rig'
import { profile, projects, type Project } from '../lib/portfolio'

type Props = {
  hidden: boolean
  canAsk: boolean
  onAction: (action: MascotAction) => void
  onAsk: (question: string) => Promise<void>
  onChat: () => void
}

export default function WorkPanel({ hidden, canAsk, onAction, onAsk, onChat }: Props) {
  const [project, setProject] = useState<Project | null>(null)
  return (
    <section className="console-section" hidden={hidden} aria-label="Selected work">
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
            disabled={!canAsk}
            onClick={() => {
              onChat()
              void onAsk(
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
  )
}
