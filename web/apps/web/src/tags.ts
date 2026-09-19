import type { Tag } from './domain.ts'

// Twelve hues spaced so neighbours in the palette read as different colours in both themes.
const HUES = [20, 45, 75, 110, 150, 175, 200, 230, 260, 290, 320, 350] as const

const FNV_OFFSET = 2166136261

const FNV_PRIME = 16777619

/** Colour is a pure function of the name (§3.7): same hue on every client, nothing stored. */
export const hueOf = (tag: Tag): number => {
  let hash = FNV_OFFSET

  for (let index = 0; index < tag.length; index++) {
    hash = Math.imul(hash ^ tag.charCodeAt(index), FNV_PRIME) >>> 0
  }

  return HUES[hash % HUES.length] ?? HUES[0]
}
