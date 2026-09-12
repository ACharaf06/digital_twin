import { MapPin } from 'lucide-react'
import { profile } from '../lib/portfolio'

type Props = {
  hidden: boolean
}

export default function StudiesPanel({ hidden }: Props) {
  return (
    <section className="console-section" hidden={hidden} aria-label={`Studies of ${profile.name}`}>
      <div className="console-heading">
        <div>
          <span className="micro-label">APPLIED MATHS / AI / BIG DATA</span>
          <h2>
            Studies<span className="blue-period">.</span>
          </h2>
        </div>
      </div>
      <p className="studies-intro">
        From applied mathematics to artificial intelligence and big data, each step moved closer to
        building useful AI systems.
      </p>
      <div className="study-list">
        {profile.education.map((study, index) => (
          <article className="study-card" key={study.school}>
            <div className="study-meta">
              <span>0{index + 1}</span>
              <time>{study.period}</time>
              <span className={study.status === 'Current' ? 'is-current' : ''}>{study.status}</span>
            </div>
            <h3>{study.degree}</h3>
            <strong>{study.school}</strong>
            <span className="study-location">
              <MapPin size={11} /> {study.location}
            </span>
            <p>{study.details}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
