import type { PadState, SignalData, StreamPreset } from '../shared/protocol'
import type { TvLink } from './connection'

// Réception de la diffusion (WebRTC) : tampon de gigue minimal pour la latence la plus faible,
// manettes renvoyées au PC par un canal non fiable (pas de retransmission, pas de retard cumulé).

export class StreamReceiver {
  private pc: RTCPeerConnection | null = null
  private dc: RTCDataChannel | null = null
  private pending: RTCIceCandidateInit[] = []
  private remoteSet = false
  private off: (() => void) | null = null
  private failTimer?: ReturnType<typeof setTimeout>
  private args: { preset: StreamPreset; mode: 'desktop' | 'game' } = { preset: 'auto', mode: 'game' }

  constructor(
    private link: TvLink,
    private video: HTMLVideoElement,
    private onState: (s: RTCPeerConnectionState | 'waiting') => void,
  ) {}

  start(preset: StreamPreset, mode: 'desktop' | 'game') {
    this.close()
    this.args = { preset, mode }
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }], bundlePolicy: 'max-bundle' })
    this.pc = pc
    this.remoteSet = false
    this.pending = []
    pc.ontrack = (e) => {
      const rx = e.receiver as RTCRtpReceiver & { jitterBufferTarget?: number; playoutDelayHint?: number }
      try {
        rx.jitterBufferTarget = 0
      } catch {
        /* navigateur ancien */
      }
      try {
        rx.playoutDelayHint = 0
      } catch {
        /* navigateur ancien */
      }
      const stream = e.streams[0] ?? new MediaStream([e.track])
      if (this.video.srcObject !== stream) {
        this.video.srcObject = stream
        this.video.play().catch(() => {
          // Lecture sonore refusée sans geste : on démarre muet
          this.video.muted = true
          this.video.play().catch(() => {})
        })
      }
    }
    pc.ondatachannel = (e) => {
      this.dc = e.channel
      e.channel.onmessage = (m) => {
        try {
          const j = JSON.parse(String(m.data))
          if (j.t === 'stats') this.link.setStats(j)
        } catch {
          /* message inconnu */
        }
      }
    }
    pc.onicecandidate = (e) => this.link.signal({ ice: e.candidate ? e.candidate.toJSON() : null })
    pc.onconnectionstatechange = () => {
      this.onState(pc.connectionState)
      clearTimeout(this.failTimer)
      // Coupure du Wi-Fi : nouvelle négociation automatique
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') this.failTimer = setTimeout(() => this.pc === pc && this.start(this.args.preset, this.args.mode), pc.connectionState === 'failed' ? 500 : 4000)
    }
    this.off = this.link.onSignal((d) => this.handle(pc, d).catch(() => {}))
    this.onState('waiting')
    this.link.watch(preset, mode)
  }

  private async handle(pc: RTCPeerConnection, d: SignalData) {
    if (pc !== this.pc) return
    if ('sdp' in d && d.sdp) {
      await pc.setRemoteDescription(d.sdp)
      this.remoteSet = true
      for (const c of this.pending.splice(0)) await pc.addIceCandidate(c).catch(() => {})
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      this.link.signal({ sdp: pc.localDescription!.toJSON() })
    } else if ('ice' in d && d.ice) {
      if (this.remoteSet) await pc.addIceCandidate(d.ice).catch(() => {})
      else this.pending.push(d.ice)
    }
  }

  get channelOpen() {
    return this.dc?.readyState === 'open'
  }

  sendPad(i: number, name: string, s: PadState) {
    if (this.dc?.readyState === 'open') this.dc.send(JSON.stringify({ t: 'p', i, n: name, ...s }))
    else this.link.pad(i, name, s)
  }

  padOff(i: number) {
    if (this.dc?.readyState === 'open') this.dc.send(JSON.stringify({ t: 'off', i }))
    else this.link.padOff(i)
  }

  private close() {
    clearTimeout(this.failTimer)
    this.off?.()
    this.off = null
    try {
      this.dc?.close()
      this.pc?.close()
    } catch {
      /* déjà fermé */
    }
    this.dc = null
    this.pc = null
  }

  stop() {
    this.close()
    this.link.unwatch()
    this.video.srcObject = null
  }
}
