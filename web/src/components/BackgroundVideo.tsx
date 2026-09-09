import { useEffect, useRef } from 'react'

const VIDEO_SRC = '/video.mp4'

const SENSITIVITY = 0.8

export default function BackgroundVideo() {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let prevX: number | null = null
    // The time we want the video to reach.
    let targetTime = 0
    // The time the most recent seek was issued for.
    let seekingFor = 0
    let isSeeking = false

    const seekToTarget = () => {
      // Only issue a new seek if the target has actually moved.
      if (Math.abs(targetTime - seekingFor) < 0.001) {
        isSeeking = false
        return
      }
      isSeeking = true
      seekingFor = targetTime
      video.currentTime = targetTime
    }

    const handleSeeked = () => {
      // If the target moved while we were seeking, queue the next one.
      if (Math.abs(targetTime - seekingFor) >= 0.001) {
        seekToTarget()
      } else {
        isSeeking = false
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      const currentX = e.clientX

      if (prevX === null) {
        prevX = currentX
        return
      }

      const duration = video.duration
      if (!duration || Number.isNaN(duration)) {
        prevX = currentX
        return
      }

      const delta = currentX - prevX
      prevX = currentX

      const offset = (delta / window.innerWidth) * SENSITIVITY * duration
      targetTime = Math.min(Math.max(targetTime + offset, 0), duration)

      // Kick off a seek if one isn't already in flight; otherwise the
      // onSeeked handler will pick up the updated target (no flooding).
      if (!isSeeking) {
        seekToTarget()
      }
    }

    video.addEventListener('seeked', handleSeeked)
    window.addEventListener('mousemove', handleMouseMove)

    return () => {
      video.removeEventListener('seeked', handleSeeked)
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [])

  return (
    <video
      ref={videoRef}
      src={VIDEO_SRC}
      muted
      playsInline
      preload="auto"
      className="fixed inset-0 h-full w-full"
      style={{
        zIndex: 0,
        objectFit: 'cover',
        objectPosition: '70% center',
      }}
    />
  )
}
