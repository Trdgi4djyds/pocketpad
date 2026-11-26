import { useEffect, useState } from 'react'
import type { SignalData, StreamPreset, StreamStats } from '../shared/protocol'

// Fenêtre invisible de PocketPad Hub : capture l'écran et le son du PC et les diffuse vers chaque TV (WebRTC).
// Les manettes branchées sur la TV reviennent par un canal de données non fiable (aucune retransmission,
// donc aucun retard accumulé quand le Wi-Fi est faible).

const PRESETS: Record<StreamPreset, { kbps: number; startKbps: number; fps: number; scale: number }> = {
  auto: { kbps: 16000, startKbps: 6000, fps: 60, scale: 1 },
  quality: { kbps: 30000, startKbps: 10000, fps: 60, scale: 1 },
  smooth: { kbps: 8000, startKbps: 4000, fps: 60, scale: 1.5 },
  eco: { kbps: 2500, startKbps: 1200, fps: 30, scale: 2 },
}

interface Peer {
  viewer: string
  pc: RTCPeerConnection
  dc: RTCDataChannel
  preset: StreamPreset
  mode: 'desktop' | 'game'
  pendingIce: RTCIceCandidateInit[]
  remoteSet: boolean
  last: { bytes: number; ts: number }
  statsTimer?: ReturnType<typeof setInterval>
}

/** Codecs vidéo : H.264 d'abord (décodage matériel sur les TV), puis VP8 / VP9. */
function preferCodecs(tx: RTCRtpTransceiver) {
  const caps = RTCRtpSender.getCapabilities?.('video')
  if (!caps || !tx.setCodecPreferences) return
  const rank = (c: { mimeType: string; sdpFmtpLine?: string }) => {
    const m = c.mimeType.toLowerCase()
    if (m === 'video/h264') return /packetization-mode=1/.test(c.sdpFmtpLine ?? '') ? (/profile-level-id=42e0/.test(c.sdpFmtpLine ?? '') ? 0 : 1) : 2
    if (m === 'video/vp8') return 3
    if (m === 'video/vp9') return 4
    if (m === 'video/av1') return 5
    return 6
  }
  try {
    tx.setCodecPreferences([...caps.codecs].sort((a, b) => rank(a) - rank(b)))
  } catch {
    /* préférences refusées : ordre par défaut */
  }
}

/** Débits de départ et maximum (paramètres reconnus par libwebrtc) et Opus stéréo. */
export function mungeAnswer(sdp: string, preset: StreamPreset) {
  const p = PRESETS[preset]
  const lines = sdp.split(/\r\n/)
  let section = ''
  const codecs = new Map<string, string>()
  for (const l of lines) {
    if (l.startsWith('m=')) section = l.slice(2, 7)
    const m = l.match(/^a=rtpmap:(\d+) ([\w-]+)\//)
    if (m) codecs.set(`${section}:${m[1]}`, m[2].toLowerCase())
  }
  const out: string[] = []
  section = ''
  const seenFmtp = new Set<string>()
  for (const l of lines) {
    if (l.startsWith('m=')) section = l.slice(2, 7)
    const f = l.match(/^a=fmtp:(\d+) (.*)$/)
    if (f) {
      const name = codecs.get(`${section}:${f[1]}`)
      seenFmtp.add(`${section}:${f[1]}`)
      if (section === 'video' && name && ['h264', 'vp8', 'vp9', 'av1'].includes(name)) {
        out.push(`${l};x-google-start-bitrate=${p.startKbps};x-google-max-bitrate=${p.kbps};x-google-min-bitrate=300`)
        continue
      }
      if (section === 'audio' && name === 'opus') {
        out.push(`${l.replace(/;?stereo=\d|;?sprop-stereo=\d|;?maxaveragebitrate=\d+/g, '')};stereo=1;sprop-stereo=1;maxaveragebitrate=160000`)
        continue
      }
    }
    out.push(l)
    const r = l.match(/^a=rtpmap:(\d+) ([\w-]+)\//)
    if (r && section === 'video' && ['vp8', 'vp9'].includes(r[2].toLowerCase()) && !lines.some((x) => x.startsWith(`a=fmtp:${r[1]} `))) {
      out.push(`a=fmtp:${r[1]} x-google-start-bitrate=${p.startKbps};x-google-max-bitrate=${p.kbps};x-google-min-bitrate=300`)
    }
  }
  return out.join('\r\n')
}

/** Flux de test (sans capture d'écran) pour les essais automatisés : ?streamer=1&test=1 */
function testStream() {
  const c = document.createElement('canvas')
  c.width = 1280
  c.height = 720
  const g = c.getContext('2d')!
  let t = 0
  const draw = () => {
    t += 1
    const grd = g.createLinearGradient(0, 0, 1280, 720)
    grd.addColorStop(0, `hsl(${t % 360} 70% 35%)`)
    grd.addColorStop(1, `hsl(${(t + 120) % 360} 70% 18%)`)
    g.fillStyle = grd
    g.fillRect(0, 0, 1280, 720)
    g.fillStyle = '#fff'
    g.fillRect(200 + Math.sin(t / 20) * 400, 300, 160, 160)
    g.font = 'bold 64px sans-serif'
    g.fillText(`PocketPad ${t}`, 80, 120)
  }
  setInterval(draw, 16)
  draw()
  return c.captureStream(60)
}

class StreamEngine {
  private ws: WebSocket | null = null
  peers = new Map<string, Peer>()
  private stream: MediaStream | null = null
  private stopTimer?: ReturnType<typeof setTimeout>
  private test = new URLSearchParams(location.search).has('test')
  status = 'Démarrage'
  onStatus?: (s: string) => void

  start() {
    const ws = new WebSocket(`ws://${location.host}/ws`)
    this.ws = ws
    ws.onopen = () => {
      ws.send(JSON.stringify({ t: 'streamer', v: 1 }))
      this.setStatus('Prêt')
    }
    ws.onmessage = (e) => this.onMessage(JSON.parse(String(e.data)))
    ws.onclose = () => {
      this.setStatus('Hub injoignable, nouvelle tentative…')
      for (const v of [...this.peers.keys()]) this.leave(v)
      setTimeout(() => this.start(), 1500)
    }
  }

  private setStatus(s: string) {
    this.status = s
    document.title = `PocketPad diffusion · ${s}`
    this.onStatus?.(s)
  }

  private send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }

  private async onMessage(m: { t: string; viewer?: string; from?: string; preset?: StreamPreset; mode?: 'desktop' | 'game'; data?: SignalData; name?: string }) {
    try {
      if (m.t === 'watch' && m.viewer) await this.watch(m.viewer, m.preset ?? 'auto', m.mode ?? 'game')
      else if (m.t === 'sig' && m.from && m.data) await this.signal(m.from, m.data)
      else if (m.t === 'left' && m.viewer) this.leave(m.viewer)
      else if (m.t === 'preset' && m.viewer && m.preset) await this.applyPreset(m.viewer, m.preset)
      else if (m.t === 'mode' && m.viewer && m.mode) await this.applyMode(m.viewer, m.mode)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.send({ t: 'stream-error', viewer: m.viewer ?? m.from, msg })
      this.setStatus(`Erreur : ${msg}`)
    }
  }

  private async capture() {
    clearTimeout(this.stopTimer)
    if (this.stream && this.stream.getVideoTracks().some((t) => t.readyState === 'live')) return this.stream
    if (this.test) return (this.stream = testStream())
    const src = await window.pocketpadStream?.getSource()
    if (!src) throw new Error('Aucun écran à capturer')
    // Capture à 1080p au plus (l'encodeur réduit ensuite selon le réseau)
    const k = Math.min(1, 1920 / src.width, 1080 / src.height)
    const video = { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: src.id, maxWidth: Math.round(src.width * k), maxHeight: Math.round(src.height * k), maxFrameRate: 60, minFrameRate: 30 } }
    const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices) as (c: unknown) => Promise<MediaStream>
    try {
      this.stream = await gum({ audio: { mandatory: { chromeMediaSource: 'desktop' } }, video })
    } catch {
      // Certains PC refusent la capture du son : vidéo seule
      this.stream = await gum({ audio: false, video })
    }
    return this.stream
  }

  private encodings(preset: StreamPreset) {
    const p = PRESETS[preset]
    return { maxBitrate: p.kbps * 1000, maxFramerate: p.fps, scaleResolutionDownBy: p.scale }
  }

  private async tune(peer: Peer) {
    const sender = peer.pc.getSenders().find((s) => s.track?.kind === 'video')
    if (!sender) return
    if (sender.track) sender.track.contentHint = peer.mode === 'desktop' ? 'detail' : 'motion'
    const params = sender.getParameters() as RTCRtpSendParameters & { degradationPreference?: string }
    if (!params.encodings?.length) params.encodings = [{}]
    Object.assign(params.encodings[0], this.encodings(peer.preset), { priority: 'high', networkPriority: 'high' })
    params.degradationPreference = peer.mode === 'desktop' ? 'maintain-resolution' : 'maintain-framerate'
    await sender.setParameters(params).catch(() => {})
  }

  private async watch(viewer: string, preset: StreamPreset, mode: 'desktop' | 'game') {
    this.leave(viewer)
    this.setStatus('Capture de l\'écran…')
    const stream = await this.capture()
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }], bundlePolicy: 'max-bundle' })
    const dc = pc.createDataChannel('input', { ordered: false, maxRetransmits: 0 })
    const peer: Peer = { viewer, pc, dc, preset, mode, pendingIce: [], remoteSet: false, last: { bytes: 0, ts: 0 } }
    this.peers.set(viewer, peer)

    const vt = stream.getVideoTracks()[0]
    vt.contentHint = mode === 'desktop' ? 'detail' : 'motion'
    const vtx = pc.addTransceiver(vt, { direction: 'sendonly', streams: [stream], sendEncodings: [this.encodings(preset)] })
    preferCodecs(vtx)
    const at = stream.getAudioTracks()[0]
    if (at) pc.addTransceiver(at, { direction: 'sendonly', streams: [stream] })

    dc.onmessage = (e) => {
      let m: { t: string; i?: number; n?: string } & Record<string, unknown>
      try {
        m = JSON.parse(String(e.data))
      } catch {
        return
      }
      if (m.t === 'p') this.send({ t: 'tvpad', viewer, i: m.i, name: m.n, b: m.b, lx: m.lx, ly: m.ly, rx: m.rx, ry: m.ry, lt: m.lt, rt: m.rt })
      else if (m.t === 'off') this.send({ t: 'tvpad-off', viewer, i: m.i })
    }
    pc.onicecandidate = (e) => this.send({ t: 'sig', to: viewer, data: { ice: e.candidate ? e.candidate.toJSON() : null } })
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') this.setStatus(`Diffusion vers ${this.peers.size} TV`)
      if (pc.connectionState === 'failed') this.send({ t: 'stream-error', viewer, msg: 'Connexion vidéo impossible : autorisez PocketPad Hub dans le pare-feu.' })
    }
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    this.send({ t: 'sig', to: viewer, data: { sdp: pc.localDescription!.toJSON() } })
    peer.statsTimer = setInterval(() => this.stats(peer), 1000)
  }

  private async signal(from: string, data: SignalData) {
    const peer = this.peers.get(from)
    if (!peer) return
    if ('sdp' in data && data.sdp) {
      await peer.pc.setRemoteDescription({ type: data.sdp.type, sdp: mungeAnswer(data.sdp.sdp ?? '', peer.preset) })
      peer.remoteSet = true
      for (const c of peer.pendingIce.splice(0)) await peer.pc.addIceCandidate(c).catch(() => {})
      await this.tune(peer)
    } else if ('ice' in data && data.ice) {
      if (peer.remoteSet) await peer.pc.addIceCandidate(data.ice).catch(() => {})
      else peer.pendingIce.push(data.ice)
    }
  }

  private async applyPreset(viewer: string, preset: StreamPreset) {
    const peer = this.peers.get(viewer)
    if (!peer) return
    peer.preset = preset
    await this.tune(peer)
  }

  private async applyMode(viewer: string, mode: 'desktop' | 'game') {
    const peer = this.peers.get(viewer)
    if (!peer) return
    peer.mode = mode
    await this.tune(peer)
  }

  private async stats(peer: Peer) {
    const report = await peer.pc.getStats().catch(() => null)
    if (!report) return
    let out: Record<string, number & string> | undefined
    let remote: Record<string, number> | undefined
    let pair: Record<string, number> | undefined
    report.forEach((r) => {
      if (r.type === 'outbound-rtp' && r.kind === 'video') out = r
      if (r.type === 'remote-inbound-rtp' && r.kind === 'video') remote = r
      if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') pair = r
    })
    if (!out) return
    const now = performance.now()
    const kbps = peer.last.ts ? ((Number(out.bytesSent) - peer.last.bytes) * 8) / (now - peer.last.ts) : 0
    peer.last = { bytes: Number(out.bytesSent), ts: now }
    const codec = out.codecId ? String(report.get(out.codecId)?.mimeType ?? '').split('/')[1] ?? '' : ''
    const stats: StreamStats = {
      w: Number(out.frameWidth) || 0,
      h: Number(out.frameHeight) || 0,
      fps: Number(out.framesPerSecond) || 0,
      kbps: Math.round(kbps),
      rtt: Math.round(((pair?.currentRoundTripTime ?? remote?.roundTripTime ?? 0) as number) * 1000),
      loss: Math.round(((remote?.fractionLost ?? 0) as number) * 1000) / 10,
      codec: codec.toUpperCase(),
      encoder: out.encoderImplementation ? String(out.encoderImplementation) : undefined,
    }
    this.send({ t: 'stats', viewer: peer.viewer, stats })
    if (peer.dc.readyState === 'open') peer.dc.send(JSON.stringify({ t: 'stats', ...stats }))
  }

  private leave(viewer: string) {
    const peer = this.peers.get(viewer)
    if (!peer) return
    clearInterval(peer.statsTimer)
    try {
      peer.pc.close()
    } catch {
      /* déjà fermée */
    }
    this.peers.delete(viewer)
    // Plus personne ne regarde : on libère la capture au bout de 15 s
    if (!this.peers.size) {
      this.setStatus('Prêt')
      this.stopTimer = setTimeout(() => {
        this.stream?.getTracks().forEach((t) => t.stop())
        this.stream = null
      }, 15000)
    }
  }
}

// Un seul moteur par fenêtre (même si le composant est monté deux fois)
let engine: StreamEngine | null = null

export function Streamer() {
  const [status, setStatus] = useState('Démarrage')
  useEffect(() => {
    if (!engine) {
      engine = new StreamEngine()
      engine.start()
      // Accès pour les tests automatisés
      ;(window as unknown as { __pocketpadStream?: StreamEngine }).__pocketpadStream = engine
    }
    engine.onStatus = setStatus
    setStatus(engine.status)
  }, [])
  return <div className="grid h-full place-items-center bg-black font-mono text-xs text-white/60">PocketPad · diffusion · {status}</div>
}
