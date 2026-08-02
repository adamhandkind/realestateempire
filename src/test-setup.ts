/* Every suite seeds the RNG for determinism; this guarantees the seed is
   cleared between tests even when an assertion throws. */
import { afterEach } from 'vitest'
import { setSeed } from './logic/rand'

afterEach(() => setSeed(null))
