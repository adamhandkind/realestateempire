import { CRINGE_QUOTES, DISASTER_FLAVORS, EVENTS } from '../data/events'
import type { EventDef, EventId, GameState } from '../state/types'
import { deriveStats } from './economy'
import { arch, makeLead } from './leads'
import { withLog } from './log'
import { chance, pick, rand } from './rand'

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
  const total = pool.reduce((t, e) => t + e.weight, 0)
  if (total <= 0) return null
  let roll = rand() * total
  let chosen = pool[0]
  for (const e of pool) {
    roll -= e.weight
    if (roll <= 0) {
      chosen = e
      break
    }
  }
  return chosen
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
      s = { ...s, cash: s.cash - 100 }
      cashDelta = -100
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
          'Your motivational video went viral for the wrong reasons. ' +
            pick(CRINGE_QUOTES) +
            ' ' +
            l.clientName +
            ' saw it, watched it twice, and stopped replying. Also, the videographer invoiced you.',
        )
      } else {
        s = withLog(
          s,
          'event',
          'Your motivational video went viral for the wrong reasons. ' +
            pick(CRINGE_QUOTES) +
            ' The comments are a crime scene. Also, the videographer invoiced you.',
        )
      }
      label = 'Went viral (badly)'
      break
    }
    default:
      break
  }
  return { state: s, cashDelta, label }
}
