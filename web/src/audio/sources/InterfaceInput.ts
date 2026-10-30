import type { InputProfile, InputSource } from '../InputSource'
import { openAudioDevice } from './device'

/** Bass plugged straight into an audio interface (Focusrite, iRig…). Clean signal, pick a channel. */
export class InterfaceInput implements InputSource {
  readonly kind = 'interface' as const
  readonly id: string
  readonly label: string
  private stream: MediaStream | null = null
  private deviceId: string | undefined

  constructor(deviceId: string | undefined, label: string) {
    this.deviceId = deviceId
    this.id = `interface:${deviceId ?? 'default'}`
    this.label = label
  }

  async start(ctx: AudioContext, profile: InputProfile): Promise<AudioNode> {
    this.stream = await openAudioDevice(this.deviceId, 2)
    const src = ctx.createMediaStreamSource(this.stream)
    const channels = this.stream.getAudioTracks()[0]?.getSettings().channelCount ?? 1
    if (channels < 2) return src
    const split = ctx.createChannelSplitter(2)
    const pick = ctx.createGain()
    src.connect(split)
    split.connect(pick, profile.channel)
    return pick
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
  }

  defaultProfile(): InputProfile {
    return { gainDb: 0, bassBoostDb: 0, gate: 0.004, latencyMs: 25, channel: 0 }
  }
}
