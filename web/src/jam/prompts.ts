export interface JamPrompt {
  title: string
  hint: string
}

/** Small constraints that spark ideas. Rotated every few bars; none of them are graded. */
export const PROMPTS: JamPrompt[] = [
  { title: 'Play only roots', hint: 'One note per chord — the big pink one. Lock it to the kick drum.' },
  { title: 'Try root–fifth', hint: 'Root, then the note two frets up on the next string. The classic bass move.' },
  { title: 'Use only 3 notes', hint: 'Pick any three lit notes and make a groove out of just those.' },
  { title: 'Leave space: 2 notes per bar', hint: 'Silence is part of the groove. Make two notes count.' },
  { title: 'Call & response', hint: 'Play a short idea for one bar, rest, then answer it the next bar.' },
  { title: 'Follow the chords', hint: 'Land on the new chord’s root exactly when it changes.' },
  { title: 'Repeat yourself', hint: 'Find a 1-bar pattern you like and play it 4 times in a row.' },
]

export function nextPrompt(i: number): number {
  return (i + 1) % PROMPTS.length
}
