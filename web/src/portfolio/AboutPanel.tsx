import { useState } from 'react'
import { ArrowUpRight, Check, Copy, Github, Linkedin, Mail } from 'lucide-react'
import { profile } from '../lib/portfolio'

type Props = {
  hidden: boolean
  onBubble: (text: string) => void
}

export default function AboutPanel({ hidden, onBubble }: Props) {
  const [copied, setCopied] = useState(false)
  return (
    <section className="console-section" hidden={hidden} aria-label={`About ${profile.name}`}>
      <div className="console-heading">
        <div>
          <span className="micro-label">THE PERSON BEHIND THE POLYGONS</span>
          <h2>
            {profile.name}
            <span className="blue-period">.</span>
          </h2>
        </div>
      </div>
      <div className="human-story">
        <p className="story-lead">
          An {profile.role.toLowerCase()}. A curious mind.
          <br />A builder at heart.
        </p>
        <p>{profile.story}</p>
        <div className="story-timeline">
          <div>
            <span>NOW</span>
            <p>
              {profile.experience[0].role} at <strong>{profile.experience[0].organization}</strong>
            </p>
          </div>
          <div>
            <span>{profile.education[0].period}</span>
            <p>
              {profile.education[0].degree}
              <br />
              <strong>{profile.education[0].school}</strong>
            </p>
          </div>
          <div>
            <span>BEFORE</span>
            <p>
              {profile.education[1].degree}, {profile.education[1].school}.{' '}
              {profile.experience[2].role} at {profile.experience[2].organization}.{' '}
              {profile.experience[1].role} at {profile.experience[1].organization}.
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
  )
}
