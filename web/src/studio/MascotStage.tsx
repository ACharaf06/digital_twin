import { useEffect, useRef } from 'react'
import { createStage, type StageState } from './createStage'

export type { StageAction } from './createStage'

type Props = StageState & {
  onReady: () => void
}

export default function MascotStage({
  entered,
  mood,
  action,
  wireframe,
  onReady,
  onInteraction,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const state = useRef<StageState>({ entered, mood, action, wireframe, onInteraction })
  state.current = { entered, mood, action, wireframe, onInteraction }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    return createStage(host, state, onReady)
  }, [onReady])

  return <div className="mascot-stage" ref={hostRef} />
}
