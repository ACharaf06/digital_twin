import ChatPanel from '../chat/ChatPanel'
import { useTwinChat } from '../chat/useTwinChat'
import type { MascotAction, MascotMood } from '../studio/rig'
import AboutPanel from '../portfolio/AboutPanel'
import StudiesPanel from '../portfolio/StudiesPanel'
import WorkPanel from '../portfolio/WorkPanel'

export type StudioView = 'chat' | 'work' | 'studies' | 'about'

type Props = {
  view: StudioView
  onView: (view: StudioView) => void
  onMood: (mood: MascotMood) => void
  onAction: (action: MascotAction) => void
  onBubble: (text: string) => void
  voice: boolean
}

export default function TwinConsole({ view, onView, onMood, onAction, onBubble, voice }: Props) {
  const chat = useTwinChat({ onMood, onAction, onBubble, voice })

  return (
    <div className="twin-console">
      <ChatPanel
        hidden={view !== 'chat'}
        messages={chat.messages}
        input={chat.input}
        busy={chat.busy}
        connection={chat.connection}
        onInput={chat.setInput}
        onSend={chat.send}
        onStop={chat.stop}
        onReset={chat.reset}
        onMood={onMood}
      />
      <WorkPanel
        hidden={view !== 'work'}
        canAsk={chat.connection === 'Live AI'}
        onAction={onAction}
        onAsk={chat.send}
        onChat={() => onView('chat')}
      />
      <StudiesPanel hidden={view !== 'studies'} />
      <AboutPanel hidden={view !== 'about'} onAction={onAction} onBubble={onBubble} />
    </div>
  )
}
