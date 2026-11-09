/* Which player actions the server accepts, and the shape of each one.

   The browser runs the same engine and applies actions optimistically, but
   the copy that counts — the one the leaderboard reads — is the one the
   server builds by replaying those actions itself. So everything a client
   sends lands here first.

   The table is keyed by every Action['type'], so adding an action to the
   engine without deciding here is a type error. `null` means the server
   refuses it: debug tools, save import, and anything that would hand the
   client a fresh game (the server makes new games itself). */

import type { Action } from '../state/types'

type Field = 'string' | 'number' | 'boolean' | 'string?'
type Spec = Record<string, Field>

const ACTIONS: Record<Action['type'], Spec | null> = {
  WORK_PHONES: {},
  ASSIST_SHOWING: {},
  RUN_SHOWING: { leadId: 'string' },
  ATTEMPT_CLOSE: { leadId: 'string' },
  SIDE_HUSTLE: {},
  BUY_SWAG: { itemId: 'string' },
  EQUIP_SWAG: { itemId: 'string' },
  TOGGLE_CHANNEL: { channelId: 'string' },
  SAVE_PRESET: { index: 'number', name: 'string' },
  LOAD_PRESET: { index: 'number' },
  RENAME_PRESET: { index: 'number', name: 'string' },
  RESOLVE_CHOICE_EVENT: { key: 'string' },
  END_WEEK: {},
  BUY_PROPERTY: { listingId: 'string', downPct: 'number' },
  SET_RENT: { propertyId: 'string', unitId: 'string', r: 'number' },
  RENAME_PROPERTY: { propertyId: 'string', nickname: 'string' },
  START_RENOVATION: { propertyId: 'string', projectId: 'string' },
  LIST_FOR_SALE: { propertyId: 'string' },
  DELIST: { propertyId: 'string' },
  RESOLVE_PORTFOLIO_CHOICE: { choiceId: 'string', actionTag: 'string' },
  HANDLE_ISSUE: { propertyId: 'string', unitId: 'string' },
  EMERGENCY_REPAIR: { propertyId: 'string' },
  EVICT: { propertyId: 'string', unitId: 'string' },
  PAY_PRINCIPAL: { propertyId: 'string' },
  TOGGLE_PROPCO: {},
  BUY_VRBO: { downPct: 'number' },
  FARM_DISTRICT: { districtId: 'string' },
  SET_CHANNEL_TARGET: { channelId: 'string', districtId: 'string?' },
  PLAY_TACTIC: { tacticId: 'string' },
  ADVANCE_CALL: {},
  CLOSE_CALL_MODAL: {},
  SET_CALLS_ENABLED: { enabled: 'boolean' },
  BUY_TABLE: { tierId: 'string' },
  ADVANCE_CEREMONY: {},
  GIVE_SPEECH: { key: 'string' },
  CLOSE_CEREMONY: {},
  TOGGLE_TROPHY: { awardId: 'string', seasonIndex: 'number' },
  CREATE_POST: { postId: 'string', captionId: 'string' },
  SKIP_POST: {},
  SET_CONTENT_ENABLED: { enabled: 'boolean' },

  /* Never from a client. */
  CITY_PURCHASE: null,
  CITY_LOG: null,
  CITY_NEGLECT: null,
  CITY_FORECLOSE: null,
  CITY_SETTLE: null,
  IMPORT_SAVE: null,
  RESTART: null,
  NEW_GAME: null,
  DEBUG_SET_MARKET: null,
  DEBUG_FORCE_CRASH: null,
  DEBUG_FILL_VACANCIES: null,
  DEBUG_CASH: null,
  DEBUG_SET_CHARACTER: null,
  DEBUG_ADD_SHARE: null,
  DEBUG_SET_SHARES: null,
  DEBUG_FORCE_SHOWDOWN: null,
  DEBUG_KING_CHECK: null,
  DEBUG_FORCE_CALL: null,
  DEBUG_SET_MOMENTUM: null,
  DEBUG_REVEAL_TELLS: null,
  DEBUG_JUMP_TO_NOMINATIONS: null,
  DEBUG_FORCE_CEREMONY: null,
  DEBUG_GRANT_TROPHY: null,
  DEBUG_FORCE_POST_OUTCOME: null,
  DEBUG_SET_CREW: null,
  DEBUG_SKIP_WEEKS: null,
}

/** Longest string field accepted. Names are clipped by the reducer anyway. */
const MAX_STRING = 80
/** Most actions in one batch. A busy week is a few dozen. */
export const MAX_BATCH = 200

/** True for action types a client may send. Exported for the UI's benefit. */
export const isClientAction = (type: string): boolean =>
  Object.prototype.hasOwnProperty.call(ACTIONS, type) &&
  ACTIONS[type as Action['type']] !== null

/** In a shared city the week ends for everyone at the tick, and listings are
 *  bid on rather than bought. */
const CITY_REFUSED: ReadonlySet<string> = new Set(['END_WEEK', 'BUY_PROPERTY'])

export const isCityClientAction = (type: string): boolean =>
  isClientAction(type) && !CITY_REFUSED.has(type)

function fieldOk(v: unknown, f: Field): boolean {
  switch (f) {
    case 'string':
      return typeof v === 'string' && v.length <= MAX_STRING
    case 'string?':
      return v === null || (typeof v === 'string' && v.length <= MAX_STRING)
    case 'number':
      return typeof v === 'number' && Number.isFinite(v)
    case 'boolean':
      return typeof v === 'boolean'
  }
}

/** Rebuilds the action from only the fields its spec names, or explains why
 *  it can't. Extra keys are dropped rather than trusted. */
export function parseAction(
  raw: unknown,
): { ok: true; action: Action } | { ok: false; error: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    return { ok: false, error: 'action is not an object' }
  const type = (raw as { type?: unknown }).type
  if (typeof type !== 'string' || !Object.prototype.hasOwnProperty.call(ACTIONS, type))
    return { ok: false, error: 'unknown action' }
  const spec = ACTIONS[type as Action['type']]
  if (!spec) return { ok: false, error: type + ' is not allowed online' }
  const out: Record<string, unknown> = { type }
  for (const [key, f] of Object.entries(spec)) {
    const v = (raw as Record<string, unknown>)[key]
    if (!fieldOk(v, f)) return { ok: false, error: type + '.' + key + ' is invalid' }
    out[key] = v
  }
  return { ok: true, action: out as Action }
}

export function parseBatch(
  raw: unknown,
  opts: { city?: boolean } = {},
): { ok: true; actions: Action[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: 'actions must be a list' }
  if (raw.length > MAX_BATCH) return { ok: false, error: 'too many actions' }
  const actions: Action[] = []
  for (const r of raw) {
    const p = parseAction(r)
    if (!p.ok) return p
    if (opts.city && CITY_REFUSED.has(p.action.type))
      return { ok: false, error: p.action.type + ' happens at the tick in a shared city' }
    actions.push(p.action)
  }
  return { ok: true, actions }
}

/** A last line of defence against payloads the reducer didn't anticipate:
 *  no honest game state ever contains NaN. (Infinity is legitimate — a
 *  tenant who never leaves — and survives the wire via the migrator.) */
export function hasNaN(v: unknown, depth = 0): boolean {
  if (depth > 40) return false
  if (typeof v === 'number') return Number.isNaN(v)
  if (Array.isArray(v)) return v.some((x) => hasNaN(x, depth + 1))
  if (v && typeof v === 'object')
    return Object.values(v).some((x) => hasNaN(x, depth + 1))
  return false
}
