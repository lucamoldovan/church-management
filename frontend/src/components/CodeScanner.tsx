'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, X, Smartphone, AlertCircle } from 'lucide-react'

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => {
      detect(source: ImageBitmapSource): Promise<Array<{ rawValue?: string }>>
    }
    NDEFReader?: new () => {
      scan(options?: { signal?: AbortSignal }): Promise<void>
      onreading: ((event: { message: { records: Array<{ recordType: string; data: BufferSource | string }>; })) => void
      onreadingerror?: (() => void) | null
    }
  }
}

interface Props {
  onScan: (value: string, source: 'qr' | 'nfc') => void
  onClose: () => void
}

export default function CodeScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState('')
  const [nfcStatus, setNfcStatus] = useState('')
  const [mode, setMode] = useState<'qr' | 'nfc'>('qr')
  const onScanRef = useRef(onScan)
  useEffect(() => { onScanRef.current = onScan }, [onScan])

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  useEffect(() => {
    if (mode !== 'qr') return
    let cancelled = false
    const start = async () => {
      if (!window.BarcodeDetector) {
        setError('Browserul nu suportă scanarea QR nativă. Poți folosi câmpul manual.')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
        const scan = async () => {
          if (cancelled || !videoRef.current || videoRef.current.readyState < 2) return
          try {
            const codes = await detector.detect(videoRef.current)
            const value = codes.find(c => c.rawValue)?.rawValue
            if (value) {
              stopCamera()
              onScanRef.current(value, 'qr')
              return
            }
          } catch {}
          if (!cancelled) requestAnimationFrame(scan)
        }
        requestAnimationFrame(scan)
      } catch {
        setError('Nu pot accesa camera. Verifică permisiunea pentru cameră și folosește HTTPS.')
      }
    }
    start()
    return () => {
      cancelled = true
      stopCamera()
    }
  }, [mode])

  const scanNfc = async () => {
    setError('')
    setNfcStatus('')
    if (!window.NDEFReader) {
      setError('NFC nu este disponibil în acest browser. Pe Android, încearcă Chrome și asigură-te că NFC este activat.')
      return
    }
    try {
      const reader = new window.NDEFReader()
      reader.onreading = (event) => {
        const record = event.message.records[0]
        if (!record) return
        let value = ''
        if (typeof record.data === 'string') value = record.data
        else {
          try { value = new TextDecoder().decode(record.data) } catch {}
        }
        if (value) onScanRef.current(value.trim(), 'nfc')
      }
      await reader.scan()
      setNfcStatus('Apropie brățara/cardul NFC de telefon...')
    } catch {
      setError('Nu am putut porni citirea NFC. Verifică NFC-ul și permisiunea browserului.')
    }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="bg-card w-full max-w-md rounded-3xl overflow-hidden soft-shadow-lg">
        <div className="flex items-center justify-between p-5 border-b border-border/60">
          <div>
            <h2 className="font-heading font-bold text-lg">Scanare</h2>
            <p className="text-xs text-muted-foreground">QR sau NFC</p>
          </div>
          <button onClick={() => { stopCamera(); onClose() }} className="p-2 rounded-full hover:bg-secondary/60"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5">
          <div className="flex gap-2 mb-4">
            <button onClick={() => { setMode('qr'); setError(''); setNfcStatus('') }} className={`flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-semibold ${mode === 'qr' ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>
              <Camera className="h-4 w-4" /> QR / Cameră
            </button>
            <button onClick={() => { setMode('nfc'); stopCamera(); scanNfc() }} className={`flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-semibold ${mode === 'nfc' ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>
              <Smartphone className="h-4 w-4" /> NFC
            </button>
          </div>

          {mode === 'qr' ? (
            <div className="aspect-square rounded-2xl overflow-hidden bg-black relative">
              <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
              <div className="absolute inset-10 border-2 border-white/80 rounded-3xl pointer-events-none" />
              <div className="absolute bottom-4 left-0 right-0 text-center text-xs text-white/90">Încadrează codul QR</div>
            </div>
          ) : (
            <div className="aspect-square rounded-2xl bg-secondary/60 flex flex-col items-center justify-center text-center p-8">
              <Smartphone className="h-16 w-16 text-primary mb-4" />
              <p className="font-semibold">Scanare NFC activă</p>
              <p className="text-sm text-muted-foreground mt-2">{nfcStatus || 'Apasă butonul NFC și apropie brățara de telefon.'}</p>
            </div>
          )}

          {error && <div className="mt-4 flex gap-2 items-start bg-destructive/10 text-destructive p-3 rounded-2xl text-sm"><AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />{error}</div>}
          <p className="text-xs text-muted-foreground mt-4 text-center">Dacă scanarea nu este disponibilă, poți folosi în continuare câmpul manual.</p>
        </div>
      </div>
    </div>
  )
}
