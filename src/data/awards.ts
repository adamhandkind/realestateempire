/* The nine categories of the Golden Lockbox Awards. All nine exist every
   season; `score` returns a raw number and logic/awards.ts normalizes it.

   Every guarded field (marketing, reputation, territory, portfolio) already
   reads 0 when its system is absent — a build without Phase 2, Phase 3, or the
   map still scores all nine without crashing. */

import { displayedValue } from '../logic/portfolio'
import { dominantDistricts } from '../logic/territory'
import type { AwardDef, GameState, SeasonStats } from '../state/types'

/** Reputation, or 0 when Phase 2 was never built. */
const repOf = (s: GameState): number => s.reputation ?? 0

/** Districts where the player holds >= 50 share. 0 without Territory. */
const dominantDistrictCount = (s: GameState): number =>
  s.territory ? dominantDistricts(s).length : 0

/** Every owned door at its displayed value. 0 without Phase 3. */
const portfolioValue = (s: GameState): number =>
  (s.properties ?? []).reduce((t, p) => t + displayedValue(s, p), 0)

/** Agent of the Year resolves after the other eight — its `score` is never
 *  called directly. logic/awards.ts special-cases this id. */
export const AGENT_OF_THE_YEAR = 'agentOfTheYear'

export const AWARDS: AwardDef[] = [
  {
    id: 'topProducer',
    name: 'Top Producer of the Year',
    subtitle:
      'Decided entirely by volume. Sponsored by a mortgage broker who is not present.',
    score: (_s, season) => season.commissionEarned / 100 + season.dealsClosed * 15,
    rivalAffinity: { chadwick: 1.3, zambonis: 1.2, krystal: 0.9 },
    reference: 780,
    perk: {
      id: 'topProducerAura',
      text: '+0.03 close chance on every lead. People have heard of you.',
    },
    winLine:
      "TOP PRODUCER OF THE YEAR. You held the lockbox aloft. Someone's mother cried. Not yours.",
    loseLine:
      '{winner} took Top Producer. You clapped at a volume you felt was appropriate.',
  },
  {
    id: 'topOnePercent',
    name: 'Top 1% of the Top 1% Award',
    subtitle:
      'Awarded to 40% of attendees annually. The math has never been questioned.',
    score: (_s, season) => 50 + season.commissionEarned / 300,
    rivalAffinity: { chadwick: 1.1, zambonis: 1.1, krystal: 1.1 },
    reference: 150,
    perk: {
      id: 'onePercentPlaque',
      text: 'Purely decorative. Adds Ego. That is the entire function.',
    },
    winLine:
      'TOP 1% OF THE TOP 1%. So is the person beside you. You will both mention it forever.',
    loseLine:
      'Somehow you missed Top 1% of the Top 1%. This is statistically remarkable.',
  },
  {
    id: 'mostImprovedSignage',
    name: 'Most Improved Signage',
    subtitle: 'A real category. Judged by three people from the printing sponsor.',
    score: (_s, season) => season.swagSpend / 40 + season.marketingSpend / 25,
    rivalAffinity: { chadwick: 0.8, zambonis: 1.4, krystal: 1.3 },
    reference: 150,
    perk: {
      id: 'signageRespect',
      text: 'Marketing channels cost 5% less. The printer owes you nothing but gives anyway.',
    },
    winLine: 'MOST IMPROVED SIGNAGE. You thanked the font. By name.',
    loseLine:
      "{winner} won Most Improved Signage. Your kerning was called 'brave' by a judge.",
  },
  {
    id: 'peoplesChoiceBench',
    name: "People's Choice Bench",
    subtitle:
      'Voted on by the public, who were shown four benches and given a pen.',
    score: (s, season) =>
      repOf(s) + season.repGained * 2 + dominantDistrictCount(s) * 8,
    rivalAffinity: { chadwick: 0.9, zambonis: 1.2, krystal: 1.5 },
    reference: 100,
    perk: {
      id: 'benchLove',
      text: '+1 Reputation per week, forever. The bench remembers.',
    },
    winLine:
      "PEOPLE'S CHOICE BENCH. The people chose your bench. This is democracy working.",
    loseLine:
      "{winner}'s bench beat your bench. The public has spoken and the public is wrong.",
  },
  {
    id: 'rookieOfTheYear',
    name: 'Rookie of the Year',
    subtitle: 'Eligible: anyone who feels like a rookie. Enforcement: none.',
    score: (s, season) =>
      s.week <= 40
        ? 60 + season.dealsClosed * 10
        : Math.max(0, 40 - (s.week - 40)),
    rivalAffinity: { chadwick: 0.4, zambonis: 0.7, krystal: 1.0 },
    reference: 120,
    perk: {
      id: 'rookieEnergy',
      text: '+1 AP every 4th week. Youthful vigour, contractually.',
    },
    winLine:
      "ROOKIE OF THE YEAR. You've been doing this for {weeks} weeks. Nobody checked. Nobody will.",
    loseLine:
      '{winner} won Rookie of the Year. {winner} has been licensed since the nineties.',
  },
  {
    id: 'hustleAward',
    name: 'The Hustle Award (presented by an energy drink)',
    subtitle:
      'For the agent who most visibly did not rest. Trophy is shaped like a phone.',
    score: (_s, season) =>
      season.showingsRun * 6 + season.closeAttempts * 4 + season.districtsFarmed * 5,
    rivalAffinity: { chadwick: 0.8, zambonis: 1.5, krystal: 1.1 },
    reference: 300,
    perk: {
      id: 'hustleTrophy',
      text: '+1 Hustle while displayed. The trophy is watching.',
    },
    winLine:
      'THE HUSTLE AWARD. You accepted it out of breath, which the sponsor loved.',
    loseLine:
      '{winner} out-hustled you on paper. The paper was a spreadsheet the sponsor made.',
  },
  {
    id: 'luxuryPortfolio',
    name: 'Luxury Portfolio Distinction',
    subtitle: 'Minimum one sale over $500,000, or a convincing anecdote.',
    score: (s, season) => season.biggestSale / 4000 + portfolioValue(s) / 20000,
    rivalAffinity: { chadwick: 1.6, zambonis: 0.5, krystal: 0.9 },
    reference: 250,
    perk: {
      id: 'luxuryDistinction',
      text: '+0.06 close chance on leads priced over $450,000.',
    },
    winLine:
      "LUXURY PORTFOLIO DISTINCTION. You said 'curated' twice at the podium and meant neither.",
    loseLine:
      '{winner} took Luxury Distinction. Chadwick applauded from inside the win.',
  },
  {
    id: 'communityService',
    name: 'Community Service Honour',
    subtitle: 'For giving back. Sponsored by a company that does not.',
    score: (_s, season) =>
      Math.max(
        0,
        season.tenantIssuesFixed * 12 +
          season.renovationsCompleted * 15 -
          season.tenantsEvicted * 20 +
          season.dealsClosed * 2,
      ),
    rivalAffinity: { chadwick: 0.6, zambonis: 1.3, krystal: 1.0 },
    reference: 150,
    perk: {
      id: 'goodNeighbour',
      text: 'Bad-review event weight halved. Tenant applicant chance +5%.',
    },
    winLine:
      'COMMUNITY SERVICE HONOUR. You fixed things and it counted. Rare night.',
    loseLine:
      '{winner} won Community Service. {winner} evicted a family in March.',
  },
  {
    id: AGENT_OF_THE_YEAR,
    name: 'AGENT OF THE YEAR',
    subtitle: 'The big one. The actual one. The one the photo goes in the paper for.',
    /* Never called — §6.4 computes this from the other eight results. */
    score: () => 0,
    rivalAffinity: { chadwick: 1.4, zambonis: 1.0, krystal: 1.1 },
    reference: 100,
    perk: {
      id: 'agentOfTheYear',
      text: '+0.05 close chance, +2 Reputation per week, and a permanent laurel on your name.',
    },
    winLine:
      'AGENT OF THE YEAR. The photo runs in the paper. You have already framed it. It is on a wall. You are looking at it now.',
    loseLine:
      '{winner} is Agent of the Year. You applauded with your whole body and drove home in silence.',
  },
]

export const AWARD_IDS: string[] = AWARDS.map((a) => a.id)

export const awardOf = (id: string): AwardDef | undefined =>
  AWARDS.find((a) => a.id === id)

/** The eight that resolve before the big one, in ceremony order. */
export const UNDERCARD: AwardDef[] = AWARDS.filter(
  (a) => a.id !== AGENT_OF_THE_YEAR,
)

/** Every perk id, so a lookup by perk never has to scan by hand. */
export const awardForPerk = (perkId: string): AwardDef | undefined =>
  AWARDS.find((a) => a.perk.id === perkId)

/** An empty season ledger. Every field starts at zero; only seasonIndex moves. */
export function emptySeasonStats(seasonIndex: number): SeasonStats {
  return {
    seasonIndex,
    dealsClosed: 0,
    commissionEarned: 0,
    showingsRun: 0,
    leadsLost: 0,
    biggestSale: 0,
    closeAttempts: 0,
    closeSuccesses: 0,
    cringeEvents: 0,
    swagSpend: 0,
    marketingSpend: 0,
    repGained: 0,
    renovationsCompleted: 0,
    tenantsEvicted: 0,
    tenantIssuesFixed: 0,
    districtsFarmed: 0,
    propertiesBought: 0,
  }
}
