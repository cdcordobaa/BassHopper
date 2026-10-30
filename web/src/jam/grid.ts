interface Anchor {
  time: number
  beat: number
  bpm: number
}

/**
 * Maps AudioContext time <-> beats for a jam whose tempo may change at bar lines.
 * Each tempo change adds an anchor, so beats recorded earlier keep their meaning.
 */
export class BeatGrid {
  private anchors: Anchor[]

  constructor(startTime: number, bpm: number, startBeat = 0) {
    this.anchors = [{ time: startTime, beat: startBeat, bpm }]
  }

  get bpm(): number {
    return this.anchors[this.anchors.length - 1].bpm
  }

  beatAt(time: number): number {
    const a = this.find((x) => x.time <= time)
    return a.beat + ((time - a.time) * a.bpm) / 60
  }

  timeAt(beat: number): number {
    const a = this.find((x) => x.beat <= beat)
    return a.time + ((beat - a.beat) * 60) / a.bpm
  }

  /** Changes tempo from `beat` onwards (drops any anchors after it). */
  setTempo(bpm: number, beat: number) {
    const time = this.timeAt(beat)
    this.anchors = this.anchors.filter((a) => a.beat < beat)
    this.anchors.push({ time, beat, bpm })
  }

  private find(pred: (a: Anchor) => boolean): Anchor {
    for (let i = this.anchors.length - 1; i >= 0; i--) if (pred(this.anchors[i])) return this.anchors[i]
    return this.anchors[0]
  }
}
