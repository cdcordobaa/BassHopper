export async function openAudioDevice(deviceId: string | undefined, channels: number): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      // Browser voice processing destroys bass: turn it all off.
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: { ideal: channels },
    },
  })
}

export async function listAudioInputs(): Promise<MediaDeviceInfo[]> {
  // Labels are only exposed after permission has been granted once.
  const probe = await openAudioDevice(undefined, 1)
  probe.getTracks().forEach((t) => t.stop())
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices.filter((d) => d.kind === 'audioinput')
}
