import type { Channel } from '../state/types'
import { REP_BETTER_CLIENTS_AT } from './reputation'

/** Share of TikTok's inbound leads that are, inevitably, Ghost Gary. */
export const TIKTOK_GHOST_RATE = 0.3
/** How often an inbound lead honours its channel's skew instead of rolling free. */
export const LEAD_POOL_SKEW = 0.7
/** Weeks TikTok goes quiet after an algorithm change. It still bills. */
export const ALGORITHM_MUTE_WEEKS = 2

export const CHANNELS: Channel[] = [
  {
    id: 'flyerBlitz',
    name: 'Flyer Blitz',
    weeklyCost: 100,
    inboundChance: 0.2,
    leadPool: ['firstTimer', 'lowballLarry', 'retireeRuth'],
    repPerWeek: 0,
    unlockRank: 'buyerAgent',
    unlockRep: 0,
    flavor: 'Windshields of the innocent.',
  },
  {
    id: 'facebookAds',
    name: 'Facebook Ads',
    weeklyCost: 250,
    inboundChance: 0.4,
    leadPool: ['firstTimer', 'retireeRuth'],
    repPerWeek: 1,
    unlockRank: 'buyerAgent',
    unlockRep: 0,
    flavor: 'Targeting: “people who exist near houses.”',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    weeklyCost: 200,
    inboundChance: 0.3,
    leadPool: ['flipBro', 'influencerIzzy'],
    repPerWeek: 1,
    unlockRank: 'buyerAgent',
    unlockRep: 0,
    flavor: 'Golden-hour photos of doorknobs.',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    weeklyCost: 150,
    inboundChance: 0.5,
    leadPool: ['firstTimer', 'influencerIzzy', 'techTyler'],
    repPerWeek: 2,
    unlockRank: 'buyerAgent',
    unlockRep: 0,
    flavor: 'Dancing next to a FOR SALE sign.',
  },
  {
    id: 'newspaperColumn',
    name: 'Newspaper Column',
    weeklyCost: 300,
    inboundChance: 0.25,
    leadPool: ['retireeRuth', 'oldMoneyOtis'],
    repPerWeek: 1,
    unlockRank: 'sellerAgent',
    unlockRep: 0,
    flavor: '“Ask The House Guy.” You are The House Guy.',
  },
  {
    id: 'communitySponsorship',
    name: 'Community Sponsorship',
    weeklyCost: 400,
    inboundChance: 0.15,
    leadPool: [],
    repPerWeek: 2,
    unlockRank: 'sellerAgent',
    unlockRep: 0,
    flavor: 'Your logo on tiny jerseys. Nobody writes a bad review about a kid.',
  },
  {
    id: 'benchDomination',
    name: 'Bench Domination',
    weeklyCost: 500,
    inboundChance: 0.3,
    leadPool: [],
    repPerWeek: 2,
    unlockRank: 'sellerAgent',
    unlockRep: 0,
    flavor: 'Your face on EVERY bench. The city council has questions.',
  },
  {
    id: 'billboard',
    name: 'Billboard',
    weeklyCost: 1000,
    inboundChance: 0.35,
    leadPool: ['luxLorenzo', 'cashChad', 'oldMoneyOtis'],
    repPerWeek: 3,
    unlockRank: 'sellerAgent',
    unlockRep: REP_BETTER_CLIENTS_AT,
    flavor: 'Forty feet of jawline over the highway.',
  },
  {
    id: 'tvCommercial',
    name: 'TV Commercial',
    weeklyCost: 2500,
    inboundChance: 0.45,
    leadPool: ['luxLorenzo', 'celebrityCleo', 'cashChad'],
    repPerWeek: 5,
    unlockRank: 'topProducer',
    unlockRep: 0,
    flavor: 'You point at the camera. A gold logo spins. A phone number sings.',
  },
]

/** Log lines keyed by channel id, used when an inbound lead arrives. */
export const INBOUND_LINES: Record<string, string> = {
  flyerBlitz:
    'A flyer survived a windshield wiper and a rainstorm and produced an actual human.',
  facebookAds:
    'Somebody clicked the ad on purpose. The algorithm has delivered a person.',
  instagram: 'A doorknob photo did numbers. One of those numbers has a phone.',
  tiktok:
    'The dance worked. Against every instinct you have left, the dance worked.',
  newspaperColumn:
    'A reader wrote in to Ask The House Guy, then asked The House Guy to sell their house.',
  communitySponsorship:
    'A parent recognized your logo from a jersey and called before the game ended.',
  benchDomination:
    'Somebody sat on your face for forty minutes waiting for a bus and then called you.',
  billboard: 'The billboard worked. Forty feet of jawline just delivered a lead.',
  tvCommercial:
    'The commercial aired at 2am between two mattress ads. The phone number sang. Someone sang back.',
}
