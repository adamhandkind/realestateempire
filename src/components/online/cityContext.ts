/* What a shared city adds to the game screen: the city view (listings with
   their sealed-bid counts, the other players, the feed) and the calls that
   go straight to the city rather than through a game move. Null in single
   player, which is how every component tells the two apart. */

import { createContext, useContext } from 'react'
import type { CityView } from '../../citygame/view'

export interface CityUi {
  view: CityView
  me: string
  isOwner: boolean
  /** Each returns an error message, or null when it worked. */
  bid: (listingId: string, amount: number, downPct: number) => Promise<string | null>
  withdraw: (listingId: string) => Promise<string | null>
}

export const CityContext = createContext<CityUi | null>(null)

export const useCity = (): CityUi | null => useContext(CityContext)
