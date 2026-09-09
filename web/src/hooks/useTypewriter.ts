import { useEffect, useState } from 'react'

interface TypewriterResult {
  displayed: string
  done: boolean
}

/**
 * Reveals `text` one character at a time.
 * @param text        The full string to type out.
 * @param speed       Milliseconds between each character (default 38).
 * @param startDelay  Milliseconds to wait before typing begins (default 600).
 */
export function useTypewriter(
  text: string,
  speed = 38,
  startDelay = 600,
): TypewriterResult {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    setDisplayed('')
    setDone(false)

    let index = 0
    let intervalId: ReturnType<typeof setInterval>

    const startId = setTimeout(() => {
      intervalId = setInterval(() => {
        index += 1
        setDisplayed(text.slice(0, index))
        if (index >= text.length) {
          clearInterval(intervalId)
          setDone(true)
        }
      }, speed)
    }, startDelay)

    return () => {
      clearTimeout(startId)
      clearInterval(intervalId)
    }
  }, [text, speed, startDelay])

  return { displayed, done }
}
