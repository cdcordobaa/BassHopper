import type { InputProfile, InputSource } from '../InputSource'
import { openAudioDevice } from './device'

/** Amp + microphone in the room. Needs bass boost and a higher gate for room noise. */
export class MicInput implements InputSource {
  readonly kind = 'mic' as const
  readonly id: string
  readonly label: string
  private stream: MediaStream | null = null
  private deviceId: string | undefined

  constructor(deviceId: string | undefined, label: string) {
    this.deviceId = deviceId
    this.id = `mic:${deviceId ?? 'default'}`
    this.label = label
  }

  async start(ctx: AudioContext): Promise<AudioNode> {
    this.stream = await openAudioDevice(this.deviceId, 1)
    return ctx.createMediaStreamSource(this.stream)
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
  }

  defaultProfile(): InputProfile {
    return { gainDb: 12, bassBoostDb: 6, gate: 0.003, latencyMs: 60, channel: 0 }
  }
}
