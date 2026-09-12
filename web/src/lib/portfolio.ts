import content from '../../../content/profile.json'

export const profile = {
  ...content.identity,
  ...content.contact,
  availability: content.availability,
  human: content.human,
  experience: content.experience,
  education: content.education,
  distinctions: content.distinctions,
  stack: content.stack,
}

export type Project = (typeof content.projects)[number]
const projectOrder = ['twin', 'vision', 'loihi']
const projectPosition = (id: string) => {
  const position = projectOrder.indexOf(id)
  return position === -1 ? Number.MAX_SAFE_INTEGER : position
}
export const projects: Project[] = content.projects
  .filter((project) => project.featured)
  .sort((left, right) => projectPosition(left.id) - projectPosition(right.id))
