import type { DrumStyle } from '../../audio/band'
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
  /** Default groove for the backing band. */
  style?: DrumStyle
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
  info: { explain: string[]; tip: string; step?: number; boss?: boolean; showNames?: boolean; style?: DrumStyle },
): Level {
  const { notes, lengthBeats } = parseNotation(notation, info.step ?? 1)
  return {
    id,
    title,
    boss: info.boss,
    explain: info.explain,
    tip: info.tip,
    showNames: info.showNames,
    style: info.style,
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
        style: 'rock',
        explain: [
          'The thickest string is E — the lowest note on your bass.',
          'Rest your thumb on the pickup. Pluck with index and middle finger, alternating: i-m-i-m.',
          'Pull the string across, not up — like you are stroking it toward the next string.',
        ],
        tip: 'Play one note per click. Let it ring until the next one.',
      }),
      level('1-2', 'The A String', 60, '(A0 A0 A0 A0)x2', {
        style: 'rock',
        explain: [
          'Next string up is A.',
          'After plucking A, let your finger land on the E string. This is a "rest stroke" and it keeps E from buzzing.',
        ],
        tip: 'Listen for unwanted ringing from the E string. Silence is a skill.',
      }),
      level('1-3', 'D and G', 60, '(D0 D0 D0 D0 G0 G0 G0 G0)x2', {
        style: 'halftime',
        explain: [
          'The two thinner strings are D and G.',
          'Lower strings can be muted by resting your thumb on them as you move up.',
        ],
        tip: 'Remember the strings low to high: E-A-D-G. "Eat All Day, Gorilla."',
      }),
      level('1-4', 'String Walk', 70, '(E0 A0 D0 G0 G0 D0 A0 E0)x2', {
        style: 'rock',
        explain: ['Now cross all four strings, up and back down.', 'Keep alternating fingers even when changing strings.'],
        tip: 'Look at the highway, not your hands. Trust where the strings are.',
      }),
      level('1-5', 'BOSS: Open Road', 80, '(E0 E0 - E0 | A0 A0 - A0 | D0 D0 A0 A0 | E0 - E0 -)x2', {
        style: 'punk',
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
        style: 'halftime',
        explain: [
          'Press the string just behind the metal fret wire, not on top of it.',
          'Thumb goes behind the neck, roughly behind your middle finger.',
          'Fret 1 = index, 2 = middle, 3 = ring finger.',
        ],
        tip: 'Press only as hard as needed for a clean note. Squeezing tires you out.',
      }),
      level('2-2', 'Spider Walk', 60, 'E1 E2 E3 E4 A1 A2 A3 A4 D1 D2 D3 D4 G1 G2 G3 G4 G4 G3 G2 G1 D4 D3 D2 D1 A4 A3 A2 A1 E4 E3 E2 E1', {
        style: 'disco',
        explain: [
          'One finger per fret: index on 1, middle on 2, ring on 3, pinky on 4.',
          'This is THE classic bass warm-up. Do it every day.',
        ],
        tip: 'Keep fingers hovering close to the strings when not pressing.',
      }),
      level('2-3', 'Name That Note', 60, '(E0 E1 E3 E5 A0 A2 A3 A5)x2', {
        style: 'halftime',
        showNames: true,
        explain: [
          'Music uses 7 letters: A B C D E F G, then it starts again.',
          'Each fret is one half-step. Most letters are 2 frets apart — except B→C and E→F, only 1 fret.',
          'So on the E string: E(0) F(1) G(3) A(5). On A: A(0) B(2) C(3) D(5).',
        ],
        tip: 'Say each note name out loud as you play it.',
      }),
      level('2-4', 'The Fifth-Fret Trick', 60, '(E5 A0 E5 A0 | A5 D0 A5 D0 | D5 G0 D5 G0)x2', {
        style: 'disco',
        showNames: true,
        explain: [
          'Fret 5 on any string is the SAME note as the next open string.',
          'E string fret 5 = A. A string fret 5 = D. D string fret 5 = G.',
          'This is how bassists tune by ear, and it means every note has more than one home.',
        ],
        tip: 'Listen: the two notes should sound identical. If not, your bass is out of tune.',
      }),
      level('2-5', 'BOSS: Low Down', 75, '(E0*0.5 E0*0.5 E3 E5 E3 | E0*0.5 E0*0.5 E5 E3 E0 | A0*0.5 A0*0.5 A3 A5 A3 | E0 E3 E0 -)x2', {
        style: 'funk',
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
        style: 'disco',
        explain: [
          'A bassist\'s #1 job is timing. The drummer and you are the engine of the band.',
          'Count "1, 2, 3, 4" out loud with the clicks. Play exactly on each number.',
        ],
        tip: 'Aim for PERFECT, not just GOOD. Being early is as wrong as being late.',
      }),
      level('3-2', 'Eighth Notes', 70, '(E0*0.5 E0*0.5 E0*0.5 E0*0.5 E0*0.5 E0*0.5 E0*0.5 E0*0.5)x2', {
        style: 'rock',
        explain: ['Eighth notes are two per click.', 'Count "1-and-2-and-3-and-4-and". Play on every number AND every "and".'],
        tip: 'Alternating fingers (i-m-i-m) becomes essential at this speed.',
      }),
      level('3-3', 'Rests Are Music', 80, 'E0 - E0 - | E0 E0 - E0 | A0 - A0 A0 | - A0 - A0', {
        style: 'funk',
        explain: ['A rest is a beat of silence, and it must really be silent.', 'Mute the string at the start of each rest — don\'t just stop plucking.'],
        tip: 'Silence makes grooves feel tight. Sloppy rests make them feel muddy.',
      }),
      level('3-4', 'Mix It Up', 80, '(E0 E0*0.5 E0*0.5 A0 A0*0.5 A0*0.5 | D0*0.5 D0*0.5 D0 A0 E0)x2', {
        style: 'rock',
        explain: ['Now quarters and eighths in the same bar.', 'Keep counting eighths in your head, even during the quarter notes.'],
        tip: 'If it falls apart, turn on Rookie mode or drop the speed to 75%.',
      }),
      level('3-5', 'BOSS: Night Drive', 90, '(E0*0.5 E0*0.5 E0*0.5 E0*0.5 E3*0.5 E3*0.5 E5*0.5 E5*0.5 | A0*0.5 A0*0.5 A0*0.5 A0*0.5 A3*0.5 A3*0.5 A5*0.5 A3*0.5)x2', {
        style: 'punk',
        boss: true,
        explain: ['A driving eighth-note groove — the backbone of rock bass.', 'Stay steady. Every note the same volume.'],
        tip: 'Start at 75% speed, then work up to 100%.',
      }),
    ],
  },
  {
    id: 'w4',
    number: 4,
    title: 'Roots',
    teaches: 'Root notes over chord changes',
    levels: [
      level('4-1', 'One Chord, One Note', 80, '(E0 E0 E0 E0 | A0 A0 A0 A0)x2', {
        style: 'rock',
        explain: [
          'Every chord has a root: the note it is named after. E chord → E note, A chord → A note.',
          'Playing the root on each beat is the most important job in bass. It tells everyone where the music is.',
          'Listen: the band changes chord every bar, and so do you.',
        ],
        tip: 'Feel the change coming: start moving to the next string on beat 4.',
      }),
      level('4-2', 'Find the Root', 80, '(E3 E3 E3 E3 | A3 A3 A3 A3 | A5 A5 A5 A5 | E3 E3 E3 E3)x2', {
        style: 'halftime',
        showNames: true,
        explain: [
          'Roots are not always open strings. Here: G (E string, fret 3), C (A string, fret 3), D (A string, fret 5).',
          'G → C → D → G is one of the most common chord changes in rock and pop.',
        ],
        tip: 'Keep your hand at fret 3: index on 3, pinky (or ring) reaches 5.',
      }),
      level('4-3', 'Eighth-Note Roots', 85, '(A3 A3 A3 A3 A3 A3 A3 A3 | A0 A0 A0 A0 A0 A0 A0 A0 | E1 E1 E1 E1 E1 E1 E1 E1 | E3 E3 E3 E3 E3 E3 E3 E3)x2', {
        style: 'rock',
        step: 0.5,
        showNames: true,
        explain: [
          'C → Am → F → G: the "four chord song" progression, heard in hundreds of hits.',
          'Driving eighth-note roots under it is a classic rock and pop bass part.',
        ],
        tip: 'F is fret 1 on the E string: press with your index finger close to the fret wire.',
      }),
      level('4-4', '12-Bar Blues', 90, 'A0 A0 A0 A0 | A0 A0 A0 A0 | A0 A0 A0 A0 | A0 A0 A0 A0 | D0 D0 D0 D0 | D0 D0 D0 D0 | A0 A0 A0 A0 | A0 A0 A0 A0 | E0 E0 E0 E0 | D0 D0 D0 D0 | A0 A0 A0 A0 | E0 E0 E0 E0', {
        style: 'rock',
        explain: [
          'The 12-bar blues is the backbone of blues, rock and roll and early rock: 12 bars, three chords.',
          'In A: 4 bars of A, 2 of D, 2 of A, then E, D, A, E. The last E turns it around to start again.',
        ],
        tip: 'Count the bars in your head: "ONE-2-3-4, TWO-2-3-4…". Soon you will feel the changes without counting.',
      }),
      level('4-5', 'BOSS: Root Rider', 90, '(E0*1.5 E0*0.5 E0 E0 | A3*1.5 A3*0.5 A3 A3 | E3*1.5 E3*0.5 E3 E3 | A5*1.5 A5*0.5 A5 E0)x2', {
        style: 'punk',
        boss: true,
        explain: [
          'Em → C → G → D, with a rhythm: long-short, then two quarters.',
          'The last note of the bar (E) is a "pickup": it leads you back to the start.',
        ],
        tip: 'The long note is 1½ beats. Count "1 - and 2 - 3 - 4": play on 1, the "and" of 2, then 3 and 4.',
      }),
    ],
  },
  {
    id: 'w5',
    number: 5,
    title: 'Shapes',
    teaches: 'Octaves, fifths, the power shape',
    levels: [
      level('5-1', 'Octave Jump', 70, '(E0 D2 E0 D2 | A0 G2 A0 G2)x2', {
        style: 'halftime',
        showNames: true,
        explain: [
          'An octave is the same note, higher. On bass it is always the same shape: two strings up, two frets up.',
          'Open E → D string fret 2 (also E). Open A → G string fret 2 (also A).',
        ],
        tip: 'Mute the strings in between with your plucking finger so only the two E\'s ring.',
      }),
      level('5-2', 'Disco Octaves', 100, '(E3 D5 E3 D5 E3 D5 E3 D5 | A3 G5 A3 G5 A3 G5 A3 G5)x2', {
        style: 'disco',
        step: 0.5,
        showNames: true,
        explain: [
          'Bouncing between a root and its octave in eighths is THE disco bass sound.',
          'G (E string fret 3) → G (D string fret 5). Index finger on the low note, ring or pinky on the high one.',
        ],
        tip: 'Keep the shape locked in your hand; move the whole hand when the chord changes.',
      }),
      level('5-3', 'The Fifth', 75, '(E3 A5 E3 A5 | A3 D5 A3 D5)x2', {
        style: 'rock',
        showNames: true,
        explain: [
          'The fifth is the root\'s best friend. Shape: one string up, two frets up.',
          'G → D (A string fret 5). C → G (D string fret 5). Root and fifth fit every chord except a few jazz ones.',
        ],
        tip: 'Use index for the root and ring finger for the fifth.',
      }),
      level('5-4', 'Power Shape', 80, '(E3 A5 D5 A5 | A3 D5 G5 D5)x2', {
        style: 'rock',
        explain: [
          'Put them together: root, fifth, octave. This is the bass player\'s power shape.',
          'Same shape works anywhere on the neck. Move it, and you have a new chord.',
        ],
        tip: 'Index on the root, ring finger covers both the fifth and the octave (they are on the same fret).',
      }),
      level('5-5', 'Root–Five Bounce', 90, '(A3 E3 A3 E3 | D3 A3 D3 A3 | E3 A5 E3 A5 | A3 E3 A3 E3)x2', {
        style: 'halftime',
        showNames: true,
        explain: [
          'The fifth also lives BELOW the root: the same fret, one string down. C (A3) → G (E3).',
          'Root, fifth, root, fifth is the country and polka bounce. C → F → G → C here.',
        ],
        tip: 'On the G bar the fifth is above (A string fret 5): there is no string below E.',
      }),
      level('5-6', 'BOSS: Octave Funk', 95, '(E0 E0 D2 E0 - E0 D2 - | A0 A0 G2 A0 - A0 G2 A0 | E0 E0 D2 E0 - E0 D2 - | E3 E3 D5 E3 A3 A3 G5 A3)x2', {
        style: 'funk',
        step: 0.5,
        boss: true,
        explain: ['Octaves with rests in between: the gaps are what make it funky.', 'The last bar moves the shape: G then C.'],
        tip: 'Mute on every rest. Funk is as much about the silence as the notes.',
      }),
    ],
  },
  {
    id: 'w6',
    number: 6,
    title: 'Scales',
    teaches: 'Pentatonic and blues',
    levels: [
      level('6-1', 'Open Pentatonic', 75, 'E0 E3 A0 A2 D0 D2 G0 G2 G2 G0 D2 D0 A2 A0 E3 E0', {
        style: 'halftime',
        showNames: true,
        explain: [
          'The minor pentatonic is a 5-note scale that sounds good over almost any rock, blues or metal song.',
          'In E, using open strings: E G A B D, then up the octave.',
          'Two notes per string. Remember the shape: 0-3, 0-2, 0-2, 0-2.',
        ],
        tip: 'Ring finger (or pinky) on fret 3, middle on fret 2.',
      }),
      level('6-2', 'The Box', 70, 'E5 E8 A5 A7 D5 D7 G5 G7 G7 G5 D7 D5 A7 A5 E8 E5', {
        style: 'rock',
        showNames: true,
        explain: [
          'The same scale as a movable "box": A minor pentatonic at fret 5.',
          'Shape: 5-8, 5-7, 5-7, 5-7. Move the box and you play in a new key.',
        ],
        tip: 'Index stays on fret 5. Pinky takes fret 8, ring finger takes fret 7.',
      }),
      level('6-3', 'Pentatonic Riff', 85, '(E0 E0*0.5 E3*0.5 A0 A2 | D0 D2*0.5 D0*0.5 A2 A0 | E0*0.5 E0*0.5 E3*0.5 E0*0.5 A0*0.5 A2*0.5 E3 | E0 - - -)x2', {
        style: 'rock',
        explain: ['Scales become music when you add rhythm. This riff uses only E minor pentatonic notes.'],
        tip: 'Try making up your own riff with these notes in Free Play or the Jam Room.',
      }),
      level('6-4', 'The Blue Note', 75, 'E5 E8 A5 A6 A7 D5 D7 - D7 D5 A7 A6 A5 E8 E5 -', {
        style: 'halftime',
        showNames: true,
        explain: [
          'Add one note to the minor pentatonic and you get the blues scale.',
          'The extra note (A string fret 6, E♭) sits between D and E. It sounds tense and bluesy.',
        ],
        tip: 'Do not stay on the blue note: pass through it on the way somewhere.',
      }),
      level('6-5', 'Happy Scale', 80, 'E3 E5 A2 A5 D2 D5 D5 D2 A5 A2 E5 E3 E3 - - -', {
        style: 'disco',
        showNames: true,
        explain: [
          'The major pentatonic sounds bright and happy: G A B D E in G.',
          'It is used in country, pop, soul and lots of Motown bass lines.',
        ],
        tip: 'A string fret 2 → 5 is a stretch: shift your hand slightly, or use index on 2 and pinky on 5.',
      }),
      level('6-6', 'BOSS: Blues Run', 90, '(E0 E3 A0 A1 A2 A0 E3 E0 | A0 A3 D0 D1 D2 D0 A3 A0 | E0 E3 A0 A1 A2 A0 E3 E0 | D2 D0 A2 A0 E3 E0 - -)x2', {
        style: 'rock',
        step: 0.5,
        boss: true,
        explain: ['A blues riff in E, moving to A and back. It uses the blue note on the way up.'],
        tip: 'Start at 75% speed. The A-string part is the same shape moved one string up.',
      }),
    ],
  },
  {
    id: 'w7',
    number: 7,
    title: 'Groove',
    teaches: 'Syncopation, sixteenths, gallops, feel',
    levels: [
      level('7-1', 'Off the Beat', 80, '(- E0 - E0 - E0 - E0 | - A0 - A0 - A0 - A0)x2', {
        style: 'disco',
        step: 0.5,
        explain: [
          'Syncopation means playing between the beats.',
          'Count "1-and-2-and…" and play ONLY on the "and". The drums keep the beat, you fill the gaps.',
        ],
        tip: 'Tap your foot on the beat. Your notes go when your foot is UP.',
      }),
      level('7-2', 'Three-Three-Two', 90, '(E0*1.5 E0*1.5 E0 | A0*1.5 A0*1.5 A0)x2', {
        style: 'rock',
        explain: [
          'Split 8 eighths into 3 + 3 + 2. This rhythm drives rock, reggaeton and tons of pop songs.',
          'Count "1-2-3, 1-2-3, 1-2" in eighths.',
        ],
        tip: 'The second note lands just before beat 3. Do not rush it.',
      }),
      level('7-3', 'Sixteenths', 65, '(E0 E0 E0 E0 E3 E3 E3 E3 A0 A0 A0 A0 A2 A2 A2 A2)x2', {
        style: 'funk',
        step: 0.25,
        explain: ['Sixteenth notes: four per beat. Count "1-e-and-a, 2-e-and-a".', 'Strict i-m-i-m alternation is a must here.'],
        tip: 'Play lightly. Small motions are faster and steadier than big ones.',
      }),
      level('7-4', 'The Gallop', 90, '(E0*0.5 E0*0.25 E0*0.25 E0*0.5 E0*0.25 E0*0.25 E0*0.5 E0*0.25 E0*0.25 E0*0.5 E0*0.25 E0*0.25 | A0*0.5 A0*0.25 A0*0.25 A0*0.5 A0*0.25 A0*0.25 A0*0.5 A0*0.25 A0*0.25 A0*0.5 A0*0.25 A0*0.25)x2', {
        style: 'punk',
        explain: [
          'The gallop: one eighth then two sixteenths, "daa-da-da". The horse-riding sound of heavy metal.',
          'Count sixteenths "1-e-and-a": play on "1", "and" and "a" → "1, and-a, 2, and-a…".',
        ],
        tip: 'Use three fingers (r-m-i) or i-m-i and restart each beat on the same finger.',
      }),
      level('7-5', 'Funk Syncopation', 95, '(E0 - - E0 - - E3 - E5 - E0 - D2 - E0 - | A0 - - A0 - - A3 - A5 - A0 - G2 - A0 -)x2', {
        style: 'funk',
        step: 0.25,
        explain: [
          'Funk lives on sixteenths that land in surprising places.',
          'The first note is on beat 1, the next comes one sixteenth before beat 2. Listen to the drums.',
        ],
        tip: 'Turn on Rookie mode and slow it down until the rhythm is in your body, then speed up.',
      }),
      level('7-6', 'BOSS: Metal Gallop', 100, 'E0*0.5 E0 E0 E0*0.5 E0 E0 E0*0.5 E0 E0 E3*0.5 E3 E3 | E0*0.5 E0 E0 E0*0.5 E0 E0 E5*0.5 E5 E5 E3*0.5 E3 E3 | E0*0.5 E0 E0 E0*0.5 E0 E0 E0*0.5 E0 E0 E3*0.5 E3 E3 | E0*0.5 E0 E0 E1*0.5 E1 E1 E0*2', {
        style: 'punk',
        step: 0.25,
        boss: true,
        explain: ['Gallops on the low E with moves to G, A and F — a full heavy-metal riff.', 'Keep the open E tight: mute it with your fretting hand between gallops.'],
        tip: 'Endurance matters here. Relax your plucking hand; tension makes you slow down.',
      }),
    ],
  },
  {
    id: 'w8',
    number: 8,
    title: 'Read It',
    teaches: 'Up the neck, reading new lines',
    levels: [
      level('8-1', 'Twelfth Fret', 70, '(E0 E12 A0 A12 | D0 D12 G0 G12)x2', {
        style: 'halftime',
        showNames: true,
        explain: [
          'Fret 12 (the double dot) is each open string one octave higher. The neck repeats from there.',
          'So everything you learned on frets 0–12 works again on 12–24.',
        ],
        tip: 'Shift your whole arm, not just your fingers, when jumping to fret 12.',
      }),
      level('8-2', 'Same Note, New Place', 70, '(A5 E10 A5 E10 | D5 A10 D5 A10 | G5 D10 G5 D10)x2', {
        style: 'rock',
        showNames: true,
        explain: [
          'Most notes live in more than one place. Fret 5 on a string = fret 10 on the string below it.',
          'D: A string fret 5 = E string fret 10. Reading tab means trusting the fret number, not habit.',
        ],
        tip: 'Both notes should sound the same. If one is clearly different, check the fret.',
      }),
      level('8-3', 'Read the Line', 80, 'E3 E3 A2 A5 | A3 A3 E3 E5 | A5 A5 D4 A5 | E3 - E5 E3 | A0 A2 A3 A0 | D0 D2 A3 A2 | E3 E5 A2 A5 | E3 - - -', {
        style: 'disco',
        explain: [
          'Eight bars that never repeat: you cannot learn it by heart in one go.',
          'Read the highway a beat ahead, the way you read the next word in a sentence.',
        ],
        tip: 'Play it at 75% speed first. Speed is the reward, not the goal.',
      }),
      level('8-4', 'Mixed Values', 80, 'E0*2 E3 E5 | A0*0.5 A0*0.5 A3 A5*2 | D0*1.5 D2*0.5 D0 A5 | E3*3 - | E0 E0*0.5 E3*0.5 A0*2 | A3*0.5 A3*0.5 A3*0.5 A5*0.5 D0*2 | D2 D0 A5*0.5 A3*0.5 A2 | E3*4', {
        style: 'halftime',
        explain: [
          'Long notes, short notes, all mixed. Long gems mean let the note ring.',
          'Do not cut long notes short: keep pressing until the gem ends.',
        ],
        tip: 'Count all the time, even through the long notes.',
      }),
      level('8-5', 'Up the Box', 75, 'E12 E15 A12 A14 D12 D14 D14 D12 A14 A12 E15 E12 E12 - - -', {
        style: 'rock',
        explain: [
          'The E minor pentatonic from World 6, one octave up at fret 12.',
          'Same shape, different place. Frets get closer together up here, so your fingers need less stretch.',
        ],
        tip: 'Look at the fret dots (12, 15) to find your place quickly.',
      }),
      level('8-6', 'BOSS: Final Exam', 95, 'E0 E0 D2 E0 - E0 E3 E5 | A3 A3 G5 A3 - A3 A5 A3 | E3 E3 D5 E3 - E3 A2 A5 | A5 A5 G7 A5 A5 A3 A2 A0 | E0 E3 A0 A2 D0 D2 D0 A2 | A0 A2 A3 A5 A3 A2 A0 E3 | E0 - E0 - E0 E3 A0 A2 | E0*2 -*2', {
        style: 'rock',
        step: 0.5,
        boss: true,
        explain: [
          'Everything at once: roots, octaves, pentatonic runs and rests, in 8 bars that never repeat.',
          'Pass this and you are ready for real songs in Riff Arena.',
        ],
        tip: 'Practise it in pieces at slow speed. Stars come from steadiness, not speed.',
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
