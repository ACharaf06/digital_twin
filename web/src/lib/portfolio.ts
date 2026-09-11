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

const list = (items: string[]) => items.join(', ')

export function getLocalReply(raw: string): string {
  const q = raw.toLowerCase()
  const has = (...words: string[]) => words.some((word) => q.includes(word))

  if (
    has(
      'contact',
      'email',
      'reach',
      'linkedin',
      'connect',
      'hire',
      'available',
      'opportunit',
      'collaborat',
      'build together',
    )
  ) {
    return `${profile.name} is open to ${list(profile.availability.roles)} opportunities from ${profile.availability.from}. He is interested in the full applied-AI journey: prototyping, deployment, evaluation, and observability. You can reach him at ${profile.email} or on LinkedIn: ${profile.linkedin} This chat does not forward messages to him.`
  }
  if (has('amadeus', 'work', 'job', 'agent', 'rag', 'loyalty')) {
    return profile.experience[0].summary
  }
  if (has('project', 'anime', 'vision', 'creative', 'built', 'show')) {
    const vision = content.projects.find((project) => project.id === 'vision')!
    return `${vision.approach} ${vision.outcome} For applied AI in a business setting, explore the Amadeus configuration assistant. This digital twin is another experiment in making AI feel more human.`
  }
  if (has('stack', 'skill', 'tech', 'python', 'framework', 'llm', 'model')) {
    return `${list(profile.stack.language)} is the foundation. For LLM systems: ${list(profile.stack.llmSystems)}. For platforms and observability: ${list(profile.stack.platforms)}. For computer vision: ${list(profile.stack.computerVision)}. ${profile.shortName} cares about the whole system, including evaluation and deployment.`
  }
  if (has('education', 'study', 'studies', 'school', 'degree', 'background', 'journey')) {
    const education = profile.education
      .map((item) => `${item.degree} at ${item.school} (${item.period}; ${item.details})`)
      .join(' Then ')
    return `${profile.name} studied ${education} His experience includes NLP and ML at Inria and applied AI at SaaSOffice. Distinctions: ${list(profile.distinctions)}.`
  }
  if (has('twin', 'human', 'you', 'who', 'hello', 'hi', 'bonjour', 'charaf')) {
    return `I'm ${profile.shortName}'s digital twin, an AI representation of the engineer behind this portfolio. ${profile.positioning} I can tell you about his projects, skills, education, and availability. In profile mode, my answers come from his written profile; I'm not the human ${profile.shortName}.`
  }
  return `I don't have that information in ${profile.shortName}'s profile. I can help with his Amadeus work, creative projects, technical stack, education, or availability. What would you like to explore?`
}
