import type { NoteFit } from './theory'

export const FIT_COLORS: Record<NoteFit, string> = {
  root: '#ff4dd2',
  chord: '#a06bff',
  scale: '#3ddc97',
  outside: '#9a91b5',
}

export const FIT_TEXT: Record<NoteFit, string> = {
  root: 'Root — rock solid',
  chord: 'Chord tone — locked in',
  scale: 'In key',
  outside: 'Outside the key — slide a fret for tension & release',
}
