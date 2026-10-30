import type { InputKind, InputSource } from '../InputSource'
import { FileInput } from './FileInput'
import { InterfaceInput } from './InterfaceInput'
import { MicInput } from './MicInput'

export { listAudioInputs } from './device'

export function createDeviceSource(kind: Exclude<InputKind, 'file'>, deviceId: string | undefined, label: string): InputSource {
  return kind === 'mic' ? new MicInput(deviceId, label) : new InterfaceInput(deviceId, label)
}

export function createFileSource(file: File): InputSource {
  return new FileInput(file)
}
