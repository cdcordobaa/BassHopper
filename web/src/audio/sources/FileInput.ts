import type { InputProfile, InputSource } from '../InputSource'

/** Plays a recorded bass clip into the detector (and your speakers). For testing without playing. */
export class FileInput implements InputSource {
  readonly kind = 'file' as const
  readonly id: string
  readonly label: string
  private file: File
  private node: AudioBufferSourceNode | null = null

  constructor(file: File) {
    this.file = file
    this.id = `file:${file.name}`
    this.label = `File: ${file.name}`
  }

  async start(ctx: AudioContext): Promise<AudioNode> {
    const buffer = await ctx.decodeAudioData(await this.file.arrayBuffer())
    this.node = ctx.createBufferSource()
    this.node.buffer = buffer
    this.node.loop = true
    this.node.connect(ctx.destination)
    this.node.start()
    return this.node
  }

  stop() {
    this.node?.stop()
    this.node?.disconnect()
    this.node = null
  }

  defaultProfile(): InputProfile {
    return { gainDb: 0, bassBoostDb: 0, gate: 0.004, latencyMs: 0, channel: 0 }
  }
}
