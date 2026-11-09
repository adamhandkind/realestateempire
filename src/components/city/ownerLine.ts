import type { LotUse } from '../../city/occupancy'
import { RIVALS } from '../../data/rivals'

/** Who owns a lot, in a few words, for the card and the hover line. */
export function ownerLine(use: LotUse): string {
  switch (use.kind) {
    case 'listing':
      return 'For sale'
    case 'owned':
      return 'Yours'
    case 'rival':
      return RIVALS.find((r) => r.id === use.rivalId)?.name ?? 'A rival'
    case 'independent':
      return 'Independent owner'
    case 'empty':
      return 'Empty lot'
    case 'player':
      return use.name
    case 'camp':
      return use.campers?.length
        ? 'Tent' + (use.campers.length > 1 ? 's' : '') + ': ' + use.campers.map((c) => c.name).join(', ')
        : 'Nobody, officially'
  }
}
