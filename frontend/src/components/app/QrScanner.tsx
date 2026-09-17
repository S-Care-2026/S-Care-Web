import jsQR from 'jsqr'
import { useEffect, useRef, useState } from 'react'

const SCAN_EVERY_MS = 200

/** Live camera preview that reports the first QR code it reads, then stops the camera. */
export function QrScanner({ onResult }: { onResult: (text: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onResultRef = useRef(onResult)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    onResultRef.current = onResult
  }, [onResult])

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setInterval> | null = null
    let stopped = false
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    const stop = () => {
      stopped = true
      if (timer) clearInterval(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      queueMicrotask(() => setError('This browser can’t open the camera here. Type the band ID and pairing code instead.'))
      return stop
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s) => {
        stream = s
        if (stopped) return stop()
        const video = videoRef.current
        if (!video) return
        video.srcObject = s
        void video.play()
        timer = setInterval(() => {
          if (!ctx || video.readyState < video.HAVE_ENOUGH_DATA) return
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const frame = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const code = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' })
          if (code?.data) {
            stop()
            onResultRef.current(code.data)
          }
        }, SCAN_EVERY_MS)
      })
      .catch((err: unknown) => {
        const denied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')
        setError(
          denied
            ? 'Camera access was blocked. Allow it in the browser’s site settings, or type the band ID and pairing code.'
            : 'No camera found. Type the band ID and pairing code instead.',
        )
      })

    return stop
  }, [])

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[260px] overflow-hidden rounded-xl border border-line bg-elev">
      {error ? (
        <p className="flex h-full items-center justify-center px-6 text-center text-[12px] text-t2" role="alert">{error}</p>
      ) : (
        <>
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline aria-label="Camera preview" />
          {['top-3 left-3 border-t-[3px] border-l-[3px]', 'top-3 right-3 border-t-[3px] border-r-[3px]', 'bottom-3 left-3 border-b-[3px] border-l-[3px]', 'right-3 bottom-3 border-r-[3px] border-b-[3px]'].map((c) => (
            <span key={c} className={`absolute h-8 w-8 rounded-sm border-green ${c}`} />
          ))}
          <span className="animate-sc-laser absolute right-6 left-6 h-[2px] bg-green" />
        </>
      )}
    </div>
  )
}
