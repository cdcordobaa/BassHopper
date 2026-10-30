/** A played note on the jam's beat grid. `end` is null while it is still ringing. */
export interface JamNote {
  midi: number
  start: number
  end: number | null
}

/** Monophonic recorder of engine note events, in beats. Keeps a bounded history. */
export class JamRecorder {
  notes: JamNote[] = []
  private keepBeats: number

  constructor(keepBeats = 64) {
    this.keepBeats = keepBeats
  }

  on(midi: number, beat: number) {
    this.off(beat)
    this.notes.push({ midi, start: beat, end: null })
    this.prune(beat)
  }

  off(beat: number) {
    const last = this.notes[this.notes.length - 1]
    if (last && last.end === null) last.end = Math.max(last.start, beat)
  }

  clear() {
    this.notes = []
  }

  /** Copy with open notes closed at `beat` — what "Save that riff" works from. */
  snapshot(beat: number): JamNote[] {
    return this.notes.map((n) => ({ ...n, end: n.end ?? Math.max(n.start, beat) }))
  }

  private prune(beat: number) {
    const cutoff = beat - this.keepBeats
    if (this.notes.length && this.notes[0].start < cutoff) this.notes = this.notes.filter((n) => (n.end ?? beat) >= cutoff)
  }
}
