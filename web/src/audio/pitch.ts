// McLeod Pitch Method (NSDF + key-maximum picking), tuned for bass range.

export interface PitchResult {
  freq: number
  clarity: number
}

const K = 0.9

export function detectPitch(
  buf: Float32Array,
  rate: number,
  minFreq = 35,
  // Just above E4 (fret 21 on G): anything higher is the band or a harmonic, not your bass.
  maxFreq = 350,
): PitchResult | null {
  const n = buf.length
  const maxLag = Math.min(n - 32, Math.ceil(rate / minFreq))
  const minLag = Math.max(2, Math.floor(rate / maxFreq))
  if (maxLag <= minLag) return null

  let mean = 0
  for (let i = 0; i < n; i++) mean += buf[i]
  mean /= n
  const x = new Float32Array(n)
  let energy = 0
  for (let i = 0; i < n; i++) {
    x[i] = buf[i] - mean
    energy += x[i] * x[i]
  }
  if (energy === 0) return null

  const nsdf = new Float32Array(maxLag + 2)
  let m = 2 * energy
  for (let tau = 0; tau <= maxLag + 1; tau++) {
    if (tau > 0) m -= x[n - tau] * x[n - tau] + x[tau - 1] * x[tau - 1]
    let r = 0
    for (let j = 0; j < n - tau; j++) r += x[j] * x[j + tau]
    nsdf[tau] = m > 0 ? (2 * r) / m : 0
  }

  // Skip the initial positive lobe, then collect one maximum per positive region.
  let tau = 1
  while (tau <= maxLag && nsdf[tau] > 0) tau++
  const peaks: number[] = []
  let best = -1
  let bestVal = -Infinity
  for (; tau <= maxLag; tau++) {
    if (nsdf[tau] > 0) {
      if (nsdf[tau] > bestVal) {
        bestVal = nsdf[tau]
        best = tau
      }
    } else if (best >= 0) {
      peaks.push(best)
      best = -1
      bestVal = -Infinity
    }
  }
  if (best >= 0) peaks.push(best)
  if (peaks.length === 0) return null

  let max = 0
  for (const p of peaks) max = Math.max(max, nsdf[p])
  const chosen = peaks.find((p) => nsdf[p] >= K * max)!
  // Pitch above the bass range (band, harmonics): reject rather than report a sub-octave.
  if (chosen < minLag) return null

  const a = nsdf[chosen - 1]
  const b = nsdf[chosen]
  const c = nsdf[chosen + 1]
  const denom = a - 2 * b + c
  const shift = denom !== 0 ? (a - c) / (2 * denom) : 0
  const lag = chosen + shift
  return { freq: rate / lag, clarity: Math.min(1, b - ((a - c) * shift) / 4) }
}

export function rms(buf: Float32Array): number {
  let s = 0
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]
  return Math.sqrt(s / buf.length)
}
