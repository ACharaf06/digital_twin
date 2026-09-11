export const profile = {
  name: 'Charaf Achir',
  role: 'AI Engineer',
  email: 'charaf.achir6@gmail.com',
  linkedin: 'https://www.linkedin.com/in/charaf-achir-19b6b21a3/',
  github: 'https://github.com/ACharaf06',
}

export type Project = {
  id: string
  number: string
  name: string
  category: string
  description: string
  tags: string[]
  context: string
  approach: string
  outcome: string
}

export const projects: Project[] = [
  {
    id: 'agent',
    number: '01',
    name: 'From question to action.',
    category: 'AMADEUS / APPLIED AI',
    description: 'An assistant that understands a loyalty platform, then gets things done.',
    tags: ['RAG', 'LangGraph', 'Azure OpenAI'],
    context:
      'Loyalty-platform configuration means navigating complex documentation and product rules. At Amadeus, I explored how a conversational assistant could make that knowledge actionable.',
    approach:
      'I built the configuration-chatbot proof of concept independently: retrieval over product documentation, then a hybrid approach combining code-generated documentation and function calling.',
    outcome:
      'Client and prospect demos helped build support for a dedicated team, OctoMind, to take these AI use cases toward production. My work also includes Member Insight and technical documentation for the AI stack.',
  },
  {
    id: 'vision',
    number: '02',
    name: 'Reality, remixed.',
    category: 'PERSONAL LAB / COMPUTER VISION',
    description: 'Live anime style transfer. Your webcam, a neural network, and a hand sign.',
    tags: ['PyTorch', 'AnimeGANv2', 'MediaPipe'],
    context:
      'A creative experiment at the intersection of computer vision, real-time inference, and anime. What if changing a visual effect felt like casting it?',
    approach:
      'AnimeGANv2 transforms live webcam frames in PyTorch on Apple Silicon. MediaPipe tracks hand landmarks so Naruto-inspired hand signs can switch visual modes.',
    outcome:
      'A live, gesture-driven style-transfer experience that connects model inference to a playful physical interaction. This is a personal experiment, not a production product.',
  },
  {
    id: 'twin',
    number: '03',
    name: 'A little more human.',
    category: 'YOU ARE HERE / DIGITAL TWIN',
    description: 'A portfolio with a presence. Part personal interface, part living experiment.',
    tags: ['Three.js', 'React', 'Conversational AI'],
    context:
      'A personal portfolio should feel like meeting the person behind the work. This experiment turns my rendered character into an interactive digital presence.',
    approach:
      'A facial-landmark mesh preserves the original cartoon portrait, extended into a volumetric head and an articulated Three.js character. Gaze, blinking, gestures, and mouth motion respond to a conversational interface grounded in my professional profile.',
    outcome:
      'The studio you are exploring now: a playful 3D mascot and a streaming AI conversation powered locally by Ollama. A clearly labeled profile preview remains available when the AI engine is offline.',
  },
]

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
    return `Charaf is open to AI Engineer and AI Specialist opportunities from September 2026. He is interested in the full applied-AI journey: prototyping, deployment, evaluation, and observability. You can reach him at ${profile.email} or on LinkedIn: ${profile.linkedin} This chat does not forward messages to him.`
  }
  if (has('amadeus', 'work', 'job', 'agent', 'rag', 'loyalty')) {
    return 'At Amadeus, Charaf works on GenAI for the loyalty platform. He built a configuration-chatbot proof of concept independently, combining retrieval over product documentation with function calling. Client demos helped support a dedicated team, OctoMind, to take the use cases toward production. His work includes the chatbot, Member Insight, and documentation for the AI stack.'
  }
  if (has('project', 'anime', 'vision', 'creative', 'built', 'show')) {
    return 'One of his favorite experiments is live anime style transfer: AnimeGANv2 transforms webcam frames in PyTorch on Apple Silicon, and MediaPipe recognizes Naruto-inspired hand signs to switch modes. For applied AI in a business setting, explore the Amadeus configuration assistant. And this digital twin is another ongoing experiment in making AI feel more human.'
  }
  if (has('stack', 'skill', 'tech', 'python', 'framework', 'llm', 'model')) {
    return 'Python is the foundation. For LLM systems: RAG, function calling, LangChain, and LangGraph. For infrastructure: Azure OpenAI, AI Foundry, LiteLLM, and Langfuse. For computer vision: PyTorch and MediaPipe. Charaf cares about the whole system, including evaluation, deployment, and observability.'
  }
  if (has('education', 'study', 'studies', 'school', 'degree', 'background', 'journey')) {
    return 'Charaf studied Applied Mathematics and Computer Science (MIASHS) at Universite Grenoble Alpes, graduating in the top 5%, then took an engineering degree at Polytech Nice-Sophia with an Artificial Intelligence major, in the top 10%, including an exchange semester at KTH in Stockholm. His 2025-2026 program is a Mastere Specialise in Big Data at Grenoble INP - Ensimag and Grenoble EM. Along the way, he worked in NLP and ML at Inria, and applied AI at SaaSOffice. He has also won two hackathons: HTE GeNiUS in Italy and Les Nuits de l Info in Sophia Antipolis.'
  }
  if (has('twin', 'human', 'you', 'who', 'hello', 'hi', 'bonjour', 'charaf')) {
    return "I'm Charaf's digital twin, an AI representation of the engineer behind this portfolio. Charaf connects a data-science foundation with a love of building useful, expressive AI experiences. I can tell you about his projects, skills, education, and availability. In profile mode, my answers come from his written profile; I'm not the human Charaf."
  }
  return "I don't have that information in Charaf's profile. I can help with his Amadeus work, creative projects, technical stack, education, or availability. What would you like to explore?"
}
