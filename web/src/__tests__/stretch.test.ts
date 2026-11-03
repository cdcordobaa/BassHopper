import { expect, it } from 'vitest'
import { stretchAfter } from '../game/chart'

it('stretches only the times after the pivot', () => {
  const t = [1, 2, 3, 5]
  stretchAfter(t, 2, 2) // half speed from t=2
  expect(t).toEqual([1, 2, 4, 8])
  stretchAfter(t, 4, 0.5) // back to full speed from t=4
  expect(t).toEqual([1, 2, 4, 6])
})
