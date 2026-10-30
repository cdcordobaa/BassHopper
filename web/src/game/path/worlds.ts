import { parseNotation, type Chart } from '../chart'

export interface Level {
  id: string
  title: string
  boss?: boolean
  /** Short explainer shown before playing. One idea per line. */
  explain: string[]
  tip: string
  /** Show note names on the gems (used while learning the fretboard). */
  showNames?: boolean
  chart: Chart
}

export interface World {
  id: string
  number: number
  title: string
  teaches: string
  levels: Level[]
}

function level(
  id: string,
  title: string,
  bpm: number,
  notation: string,
  info: { explain: string[]; tip: string; step?: number; boss?: boolean; showNames?: boolean },
): Level {
  const { notes, lengthBeats } = parseNotation(notation, info.step ?? 1)
  return {
    id,
    title,
    boss: info.boss,
    explain: info.explain,
    tip: info.tip,
    showNames: info.showNames,
    chart: { id, title, bpm, beatsPerBar: 4, notes, lengthBeats },
  }
}

export const WORLDS: World[] = [
  {
    id: 'w1',
    number: 1,
    title: 'Hello Bass',
    teaches: 'Open strings, plucking, muting',
    levels: [
      level('1-1', 'Low E', 60, '(E0 E0 E0 E0)x2', {
        explain: [
          'The thickest string is E — the lowest note on your bass.',
          'Rest your thumb on the pickup. Pluck with index and middle finger, alternating: i-m-i-m.',
          'Pull the string across, not up — like you are stroking it toward the next string.',
        ],
        tip: 'Play one note per click. Let it ring until the next one.',
      }),
      level('1-2', 'The A String', 60, '(A0 A0 A0 A0)x2', {
        explain: [
          'Next string up is A.',
          'After plucking A, let your finger land on the E string. This is a "rest stroke" and it keeps E from buzzing.',
        ],
        tip: 'Listen for unwanted ringing from the E string. Silence is a skill.',
      }),
      level('1-3', 'D and G', 60, '(D0 D0 D0 D0 G0 G0 G0 G0)x2', {
        explain: [
          'The two thinner strings are D and G.',
          'Lower strings can be muted by resting your thumb on them as you move up.',
        ],
        tip: 'Remember the strings low to high: E-A-D-G. "Eat All Day, Gorilla."',
      }),
      level('1-4', 'String Walk', 70, '(E0 A0 D0 G0 G0 D0 A0 E0)x2', {
        explain: ['Now cross all four strings, up and back down.', 'Keep alternating fingers even when changing strings.'],
        tip: 'Look at the highway, not your hands. Trust where the strings are.',
      }),
      level('1-5', 'BOSS: Open Road', 80, '(E0 E0 - E0 | A0 A0 - A0 | D0 D0 A0 A0 | E0 - E0 -)x2', {
        boss: true,
        explain: ['Your first groove! The gaps are rests — stop the string from ringing during them.'],
        tip: 'To mute a rest, lightly touch the string with your plucking finger or fretting hand.',
      }),
    ],
  },
  {
    id: 'w2',
    number: 2,
    title: 'Fret Hand',
    teaches: 'Frets 1–5, one finger per fret, note names',
    levels: [
      level('2-1', 'First Frets', 60, '(E0 E1 E2 E3 E3 E2 E1 E0)x2', {
        explain: [
          'Press the string just behind the metal fret wire, not on top of it.',
          'Thumb goes behind the neck, roughly behind your middle finger.',
          'Fret 1 = index, 2 = middle, 3 = ring finger.',
        ],
        tip: 'Press only as hard as needed for a clean note. Squeezing tires you out.',
      }),
      level('2-2', 'Spider Walk', 60, 'E1 E2 E3 E4 A1 A2 A3 A4 D1 D2 D3 D4 G1 G2 G3 G4 G4 G3 G2 G1 D4 D3 D2 D1 A4 A3 A2 A1 E4 E3 E2 E1', {
        explain: [
          'One finger per fret: index on 1, middle on 2, ring on 3, pinky on 4.',
          'This is THE classic bass warm-up. Do it every day.',
        ],
        tip: 'Keep fingers hovering close to the strings when not pressing.',
      }),
      level('2-3', 'Name That Note', 60, '(E0 E1 E3 E5 A0 A2 A3 A5)x2', {
        showNames: true,
        explain: [
          'Music uses 7 letters: A B C D E F G, then it starts again.',
          'Each fret is one half-step. Most letters are 2 frets apart — except B→C and E→F, only 1 fret.',
          'So on the E string: E(0) F(1) G(3) A(5). On A: A(0) B(2) C(3) D(5).',
        ],
        tip: 'Say each note name out loud as you play it.',
      }),
      level('2-4', 'The Fifth-Fret Trick', 60, '(E5 A0 E5 A0 | A5 D0 A5 D0 | D5 G0 D5 G0)x2', {
        showNames: true,
        explain: [
          'Fret 5 on any string is the SAME note as the next open string.',
          'E string fret 5 = A. A string fret 5 = D. D string fret 5 = G.',
          'This is how bassists tune by ear, and it means every note has more than one home.',
        ],
        tip: 'Listen: the two notes should sound identical. If not, your bass is out of tune.',
      }),
      level('2-5', 'BOSS: Low Down', 75, '(E0*0.5 E0*0.5 E3 E5 E3 | E0*0.5 E0*0.5 E5 E3 E0 | A0*0.5 A0*0.5 A3 A5 A3 | E0 E3 E0 -)x2', {
        boss: true,
        explain: ['A real riff using everything so far: open strings, frets 3 and 5, and two strings.'],
        tip: 'Put your index finger on fret 3 and your ring finger on fret 5. Your hand barely moves.',
      }),
    ],
  },
  {
    id: 'w3',
    number: 3,
    title: 'Lock In',
    teaches: 'Timing: quarters, eighths, rests',
    levels: [
      level('3-1', 'Quarter Notes', 80, '(A0 A0 A0 A0)x4', {
        explain: [
          'A bassist\'s #1 job is timing. The drummer and you are the engine of the band.',
          'Count "1, 2, 3, 4" out loud with the clicks. Play exactly on each number.',
        ],
        tip: 'Aim for PERFECT, not just GOOD. Being early is as wrong as being late.',
      }),
      level('3-2', 'Eighth Notes', 70, '(E0*0.5 E0*0.5 E0*0.5 E0*0.5 E0*0.5 E0*0.5 E0*0.5 E0*0.5)x2', {
        explain: ['Eighth notes are two per click.', 'Count "1-and-2-and-3-and-4-and". Play on every number AND every "and".'],
        tip: 'Alternating fingers (i-m-i-m) becomes essential at this speed.',
      }),
      level('3-3', 'Rests Are Music', 80, 'E0 - E0 - | E0 E0 - E0 | A0 - A0 A0 | - A0 - A0', {
        explain: ['A rest is a beat of silence, and it must really be silent.', 'Mute the string at the start of each rest — don\'t just stop plucking.'],
        tip: 'Silence makes grooves feel tight. Sloppy rests make them feel muddy.',
      }),
      level('3-4', 'Mix It Up', 80, '(E0 E0*0.5 E0*0.5 A0 A0*0.5 A0*0.5 | D0*0.5 D0*0.5 D0 A0 E0)x2', {
        explain: ['Now quarters and eighths in the same bar.', 'Keep counting eighths in your head, even during the quarter notes.'],
        tip: 'If it falls apart, turn on Rookie mode or drop the speed to 75%.',
      }),
      level('3-5', 'BOSS: Night Drive', 90, '(E0*0.5 E0*0.5 E0*0.5 E0*0.5 E3*0.5 E3*0.5 E5*0.5 E5*0.5 | A0*0.5 A0*0.5 A0*0.5 A0*0.5 A3*0.5 A3*0.5 A5*0.5 A3*0.5)x2', {
        boss: true,
        explain: ['A driving eighth-note groove — the backbone of rock bass.', 'Stay steady. Every note the same volume.'],
        tip: 'Start at 75% speed, then work up to 100%.',
      }),
    ],
  },
]

export const ALL_LEVELS: Level[] = WORLDS.flatMap((w) => w.levels)

export function findLevel(id: string): Level | undefined {
  return ALL_LEVELS.find((l) => l.id === id)
}

export function nextLevel(id: string): Level | undefined {
  const i = ALL_LEVELS.findIndex((l) => l.id === id)
  return i >= 0 ? ALL_LEVELS[i + 1] : undefined
}
