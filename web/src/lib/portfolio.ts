import content from '../../../content/profile.json'

export const profile = {
  ...content.identity,
  ...content.contact,
  availability: content.availability,
  experience: content.experience,
  education: content.education,
  distinctions: content.distinctions,
  stack: content.stack,
}

export type Project = (typeof content.projects)[number]
export const projects: Project[] = content.projects.filter((project) => project.featured)
