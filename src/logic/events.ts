import {
  BAD_REVIEW_BASE_WEIGHT,
  BAD_REVIEW_LINES,
  COPYCAT_LINES,
  CRINGE_HIGH_FAME,
  CRINGE_QUOTES,
  DISASTER_FLAVORS,
  EVENTS,
  GALA_LINES,
  NEWS_COVERAGE,
  VIRAL_SCENARIOS,
  VRBO_MAX_GAP,
  VRBO_MIN_GAP,
  VRBO_PITCHES,
} from '../data/events'
import { ALGORITHM_MUTE_WEEKS } from '../data/marketing'
import { P3 } from '../data/p3'
import { REP_CRINGE_PENALTY, REP_CRINGE_SCALES_AT } from '../data/reputation'
import { VRBO_OFFER_BODY } from '../data/vrbo'
import type {
  EventDef,
  EventId,
  GameState,
  PendingChoice,
} from '../state/types'
import { atLeastRank, clampRep, deriveStats } from './economy'
import { arch, makeLead } from './leads'
import { withLog } from './log'
import { chance, pick, rand, randInt } from './rand'

export interface EventResult {
  state: GameState
  cashDelta: number
  label: string
}

/**
 * The weekly 30% roll, then a weighted pick from the events whose condition
 * passes. Returns null when the roll misses or nothing is eligible.
 */
export function selectEvent(state: GameState): EventDef | null {
  if (!chance(0.3)) return null
  const pool = EVENTS.filter((e) => e.condition(state))
  const weightOf = (e: EventDef): number =>
    e.id === 'badReview' ? badReviewWeight(state) : e.weight
  const total = pool.reduce((t, e) => t + weightOf(e), 0)
  if (total <= 0) return null
  let roll = rand() * total
  let chosen = pool[0]
  for (const e of pool) {
    roll -= weightOf(e)
    if (roll <= 0) {
      chosen = e
      break
    }
  }
  return chosen
}

/** Community Sponsorship halves how often bad reviews come up. */
export function badReviewWeight(state: GameState): number {
  return state.activeChannelIds.includes('communitySponsorship')
    ? BAD_REVIEW_BASE_WEIGHT / 2
    : BAD_REVIEW_BASE_WEIGHT
}

/** The guaranteed 6–9 week VRBO cadence, independent of the 30% roll. */
export function vrboDue(state: GameState): boolean {
  return (
    atLeastRank(state.rank, 'sellerAgent') &&
    state.week >= state.gagCounters.nextVrboWeek
  )
}

export function scheduleNextVrbo(state: GameState): GameState {
  return {
    ...state,
    gagCounters: {
      ...state.gagCounters,
      nextVrboWeek: state.week + randInt(VRBO_MIN_GAP, VRBO_MAX_GAP),
    },
  }
}

/** Fires independently of the 30% roll, once ego gets loud enough. */
export function shouldCringe(state: GameState): boolean {
  return deriveStats(state).ego >= 8 && chance(0.2)
}

export function applyEvent(state: GameState, id: EventId): EventResult {
  let s = state
  let cashDelta = 0
  let label = ''
  const activeLeads = s.leads
  switch (id) {
    case 'ghosted': {
      const l = pick(activeLeads)
      const a = arch(l.archetypeId)
      s = {
        ...s,
        leads: s.leads.filter((x) => x.id !== l.id),
        counters: { ...s.counters, leadsLost: s.counters.leadsLost + 1 },
      }
      s = withLog(s, 'event', l.clientName + ' ' + pick(a.ghosts))
      label = 'Client vanished'
      break
    }
    case 'lockbox': {
      const l = pick(activeLeads.filter((x) => x.stage === 'shown'))
      s = {
        ...s,
        cash: s.cash - 50,
        leads: s.leads.map((x) =>
          x.id === l.id ? { ...x, patience: Math.max(0, x.patience - 1) } : x,
        ),
      }
      cashDelta = -50
      s = withLog(
        s,
        'event',
        'The lockbox ate the key with ' +
          l.clientName +
          ' standing in the rain behind you. A locksmith arrived, judged you, and charged you.',
      )
      label = 'Locksmith'
      break
    }
    case 'poached': {
      const l = pick(activeLeads.filter((x) => x.stage === 'ready'))
      s = {
        ...s,
        leads: s.leads.filter((x) => x.id !== l.id),
        counters: { ...s.counters, leadsLost: s.counters.leadsLost + 1 },
      }
      s = withLog(
        s,
        'event',
        'Chadwick Sterling III took ' +
          l.clientName +
          ' to lunch, said the words “boutique white-glove experience,” and walked out with your deal. His teeth are fake. Everyone knows.',
      )
      label = 'Poached by Chadwick'
      break
    }
    case 'referral': {
      const lead = { ...makeLead(s), referralBonus: true }
      s = { ...s, leads: [...s.leads, lead] }
      s = withLog(
        s,
        'event',
        'A past client told ' +
          lead.clientName +
          ' you were “actually normal,” which in this industry is a rave review. They arrived pre-sold.',
      )
      label = 'Referral'
      break
    }
    case 'hotMarket': {
      s = {
        ...s,
        activeModifiers: [
          ...s.activeModifiers,
          { closeChanceDelta: 0.1, expiresWeek: s.week + 2 },
        ],
      }
      s = withLog(
        s,
        'event',
        'The market went feral. Buyers are waiving inspections and apologizing to sellers for existing.',
      )
      label = 'Hot market'
      break
    }
    case 'rateSpike': {
      s = {
        ...s,
        activeModifiers: [
          ...s.activeModifiers,
          { closeChanceDelta: -0.1, expiresWeek: s.week + 2 },
        ],
      }
      s = withLog(
        s,
        'event',
        'Rates jumped. Every buyer in town suddenly wants to “watch it for a bit.”',
      )
      label = 'Rate spike'
      break
    }
    case 'lostPaperwork': {
      s = { ...s, cash: s.cash - 100 }
      cashDelta = -100
      s = withLog(
        s,
        'money',
        'The registry misplaced a form and fined you. They asked you to fax the replacement. In 2026. They had a fax. It worked.',
      )
      label = 'Paperwork fine'
      break
    }
    case 'openHouseDisaster': {
      s = {
        ...s,
        cash: s.cash - 150,
        permBonuses: { ...s.permBonuses, hustle: s.permBonuses.hustle + 1 },
      }
      cashDelta = -150
      s = withLog(
        s,
        'event',
        'At the open house, ' +
          pick(DISASTER_FLAVORS) +
          '. You cleaned it up, paid for it, and came out slightly harder to rattle.',
      )
      label = 'Open house disaster'
      break
    }
    case 'fiveStarReview': {
      const capped = deriveStats(s).swagger >= 10
      s = { ...s, cash: s.cash + 200 }
      if (!capped)
        s = {
          ...s,
          permBonuses: { ...s.permBonuses, swagger: s.permBonuses.swagger + 1 },
        }
      cashDelta = 200
      s = withLog(
        s,
        'money',
        'A past client left five stars and a paragraph about your “calming energy.” The brokerage sent a bonus and printed the quote on a wall.',
      )
      label = 'Five-star review'
      break
    }
    case 'cringeEvent': {
      const famous = s.reputation >= REP_CRINGE_SCALES_AT
      s = { ...s, cash: s.cash - 100 }
      cashDelta = -100
      if (famous)
        s = { ...s, reputation: clampRep(s.reputation - REP_CRINGE_PENALTY) }
      const scene = famous
        ? pick(CRINGE_HIGH_FAME) + ' ' + pick(NEWS_COVERAGE)
        : 'Your motivational video went viral for the wrong reasons. ' +
          pick(CRINGE_QUOTES)
      if (s.leads.length) {
        const l = pick(s.leads)
        s = {
          ...s,
          leads: s.leads.filter((x) => x.id !== l.id),
          counters: { ...s.counters, leadsLost: s.counters.leadsLost + 1 },
        }
        s = withLog(
          s,
          'event',
          scene +
            ' ' +
            l.clientName +
            ' saw it, watched it twice, and stopped replying. Also, the videographer invoiced you.',
        )
      } else {
        s = withLog(
          s,
          'event',
          scene +
            ' The comments are a crime scene. Also, the videographer invoiced you.',
        )
      }
      label = 'Went viral (badly)'
      break
    }
    case 'viralSuccess': {
      s = { ...s, reputation: clampRep(s.reputation + 10) }
      const fresh = [makeLead(s), makeLead(s), makeLead(s)]
      s = { ...s, leads: [...s.leads, ...fresh] }
      s = withLog(
        s,
        'event',
        pick(VIRAL_SCENARIOS) +
          ' Three strangers called before you finished reading the comments: ' +
          fresh.map((l) => l.clientName).join(', ') +
          '.',
      )
      label = 'Went viral (well)'
      break
    }
    case 'badReview': {
      s = { ...s, cash: s.cash - 200, reputation: clampRep(s.reputation - 8) }
      cashDelta = -200
      s = withLog(
        s,
        'event',
        pick(BAD_REVIEW_LINES) +
          ' You paid a reputation-management service to reply politely on your behalf.',
      )
      label = 'One-star essay'
      break
    }
    case 'algorithmChange': {
      s = {
        ...s,
        channelMuteUntil: {
          ...s.channelMuteUntil,
          tiktok: s.week + ALGORITHM_MUTE_WEEKS,
        },
      }
      s = withLog(
        s,
        'event',
        'The algorithm changed overnight. Your videos now reach four people, three of whom are you on other devices. The invoice, however, arrives exactly on time.',
      )
      label = 'Algorithm change'
      break
    }
    case 'vrboSpam': {
      const n = s.gagCounters.vrboOffers
      const converts =
        n >= P3.VRBO.MIN_DECLINES &&
        s.rank === 'topProducer' &&
        !s.gagCounters.vrboOwned &&
        !s.gagCounters.vrboDeclinedForever
      const options: PendingChoice['options'] = [
        {
          key: 'decline',
          label: 'Decline (for now)',
          hint: converts
            ? 'The word “for now” is doing a lot of work.'
            : 'There is no other button. There will be, one day.',
        },
      ]
      if (converts) {
        options.push({
          key: 'declineForever',
          label: 'Decline (forever)',
          hint: 'He never calls again. You never find out.',
        })
        options.push({
          key: 'buyVrbo',
          label: 'Buy it — $480,000',
          hint: 'A MACHINE waiting for an operator.',
        })
      }
      s = {
        ...s,
        gagCounters: { ...s.gagCounters, vrboOffers: n + 1 },
        pendingChoice: {
          id: 'vrboSpam',
          title: 'THE 424/7 VRBO',
          body: converts
            ? VRBO_OFFER_BODY
            : VRBO_PITCHES[Math.min(n, VRBO_PITCHES.length - 1)],
          options,
        },
      }
      label = 'The 424/7 VRBO'
      break
    }
    case 'tvInterview': {
      s = {
        ...s,
        pendingChoice: {
          id: 'tvInterview',
          title: 'LOCAL TV WANTS FOUR MINUTES',
          body: 'The morning show wants you between a weather hit and a segment about a duck. The producer asks how you want to come across.',
          options: [
            {
              key: 'humble',
              label: 'Stay humble',
              hint: 'Credit the team. Look trustworthy. Sleep fine.',
            },
            {
              key: 'ego',
              label: 'Full ego',
              hint: 'Point at the camera. Say your own name twice.',
            },
          ],
        },
      }
      label = 'TV interview'
      break
    }
    case 'copycatAgent': {
      s = {
        ...s,
        pendingChoice: {
          id: 'copycatAgent',
          title: 'CHADWICK STERLING III HAS NOTES',
          body: pick(COPYCAT_LINES),
          options: [
            {
              key: 'cease',
              label: 'Pay $500 for a cease-and-desist',
              hint: 'A lawyer writes one paragraph. It works.',
            },
            {
              key: 'eat',
              label: 'Let it go',
              hint: 'Free. Costs you something else.',
            },
          ],
        },
      }
      label = 'Copycat agent'
      break
    }
    case 'charityGala': {
      s = {
        ...s,
        pendingChoice: {
          id: 'charityGala',
          title: 'THE CHARITY GALA',
          body: pick(GALA_LINES),
          options: [
            {
              key: 'attend',
              label: 'Pay $500 and attend',
              hint: 'Handshakes, a photo wall, and one very good lead.',
            },
            {
              key: 'skip',
              label: 'Skip it',
              hint: 'The parking lot has a view of the window.',
            },
          ],
        },
      }
      label = 'Charity gala'
      break
    }
    default:
      break
  }
  return { state: s, cashDelta, label }
}
