import { describe, expect, it } from 'vitest'
import { CHARACTERS } from '../../data/characters'
import { FACES } from '../../data/faces'

describe('agent faces', () => {
  it('gives every playable character a face of their own', () => {
    for (const c of CHARACTERS) expect(FACES[c.id], c.id).toBeDefined()
  })

  it('has no face for a character who does not exist', () => {
    const ids = new Set(CHARACTERS.map((c) => c.id))
    for (const id of Object.keys(FACES)) expect(ids.has(id), id).toBe(true)
  })
})
