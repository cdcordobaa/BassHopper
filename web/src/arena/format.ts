/** Seconds → "m:ss", rounding the total first so 119.6 reads "2:00", not "1:60". */
export function fmtDuration(sec: number): string {
  const t = Math.max(0, Math.round(sec))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}
