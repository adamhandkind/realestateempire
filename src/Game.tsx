import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import BragTicker from './components/BragTicker'
import CeremonyModal from './components/CeremonyModal'
import { NominationBanner } from './components/TablePicker'
import ClosetTab from './components/ClosetTab'
import Header from './components/Header'
import LeadsTab from './components/LeadsTab'
import LogTab from './components/LogTab'
import MapTab from './components/MapTab'
import MarketingTab from './components/MarketingTab'
import OfficeTab from './components/OfficeTab'
import CallModal from './components/CallModal'
import PortfolioChoiceModal from './components/PortfolioChoiceModal'
import PortfolioTab from './components/PortfolioTab'
import PostComposer from './components/PostComposer'
import TodayTab from './components/TodayTab'
import { useCity } from './components/online/cityContext'
import { buildBriefing, urgentCount } from './logic/briefing'
import WeekSummaryModal from './components/WeekSummaryModal'
import { activeMarketModifier, isPhase2Teaser, rankOf } from './logic/economy'
import { money } from './logic/rand'
import { parseImport, serialize } from './state/serial'
import type { Action, GameState, WeekSummary } from './state/types'

type TabId = 'today' | 'office' | 'marketing' | 'leads' | 'portfolio' | 'city' | 'closet' | 'log' | 'league'

const TABS: [TabId, string][] = [
  ['today', 'Today'],
  ['city', 'City'],
  ['office', 'Office'],
  ['marketing', 'Marketing'],
  ['leads', 'Leads'],
  ['portfolio', 'Portfolio'],
  ['closet', 'Closet'],
  ['log', 'Log'],
]

/** Extra bits the online game hangs on the shell. */
export interface OnlineShell {
  /** The League tab: leaderboard, invites, account. */
  league: ReactNode
  /** Save status, shown under the header. */
  status: ReactNode
  /** Shared city: replaces the End Week button (the week ends at the tick). */
  endWeek?: ReactNode
  /** Shared city: the morning report's extra lines, under the Week Summary. */
  summaryExtra?: ReactNode
  /** Shared city: the morning report has been read. */
  onSummaryClosed?: () => void
  /** Shared city: the last tick's report, for the Today briefing. */
  report?: { summary: WeekSummary | null; offers: string[] } | null
}

/** The game screen — header, tabs, End Week, modals — for any source of
 *  state: the local reducer (offline play) or the cloud store (online). */
export default function Game({
  state,
  dispatch,
  onNewGame,
  online,
}: {
  state: GameState
  dispatch: (a: Action) => void
  /** Game over → New Game, and the debug panel's New Game button. */
  onNewGame: () => void
  online?: OnlineShell
}) {
  /* Today is the front door: what happened, what needs you, what's next. */
  const [tab, setTab] = useState<TabId>('today')
  const [showSummary, setShowSummary] = useState(false)
  const [confetti, setConfetti] = useState(false)
  const [importText, setImportText] = useState('')
  const [exported, setExported] = useState('')
  const [bump, setBump] = useState(false)
  const prevCash = useRef(state.cash)

  useEffect(() => {
    if (state.cash !== prevCash.current) {
      prevCash.current = state.cash
      setBump(true)
      const t = setTimeout(() => setBump(false), 460)
      return () => clearTimeout(t)
    }
  }, [state.cash])

  useEffect(() => {
    if (state.summary) setShowSummary(true)
  }, [state.summary])

  useEffect(() => {
    if (state.promo) {
      setConfetti(true)
      const t = setTimeout(() => setConfetti(false), 2600)
      return () => clearTimeout(t)
    }
  }, [state.promo])

  const market = activeMarketModifier(state)
  const city = useCity()
  const openBids = city ? city.view.listings.filter((l) => l.myBid).length : 0
  const report = online?.report
  const briefing = useMemo(
    () =>
      buildBriefing(state, {
        ...(report ? { summary: report.summary ?? state.summary, offers: report.offers } : {}),
        openBids,
      }),
    [state, report, openBids],
  )
  const urgent = urgentCount(briefing)

  const doExport = () => {
    const s = serialize(state)
    setExported(s)
    try {
      if (navigator.clipboard) navigator.clipboard.writeText(s)
    } catch {
      /* clipboard unavailable — the textarea is still there to copy from */
    }
  }

  const doImport = () => {
    if (online) return
    try {
      const parsed = parseImport(importText)
      if (parsed) {
        dispatch({ type: 'IMPORT_SAVE', state: parsed })
        setImportText('')
      } else {
        alert("That doesn't look like a Real Estate Simulator save.")
      }
    } catch {
      alert("That save wouldn't parse. Check the paste.")
    }
  }

  if (state.gameOver) {
    return (
      <div className="res-app">
        <div className="res-modal">
          <div className="res-card">
            <h2 className="res-display">MOVED BACK IN WITH YOUR PARENTS</h2>
            <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>
              Your mother has put the bus bench ad in the garage. Your father
              keeps calling it “the realtor thing.” The gold, such as it was, has
              been repossessed.
            </p>
            <div className="res-line">
              <span>Weeks survived</span>
              <b>{state.week}</b>
            </div>
            <div className="res-line">
              <span>Career earnings</span>
              <b>{money(state.careerEarnings)}</b>
            </div>
            <div className="res-line">
              <span>Deals closed</span>
              <b>{state.counters.dealsClosed}</b>
            </div>
            <div className="res-line">
              <span>Showings run</span>
              <b>{state.counters.showingsRun}</b>
            </div>
            <div className="res-line">
              <span>Clients lost</span>
              <b>{state.counters.leadsLost}</b>
            </div>
            <div className="res-line">
              <span>Final rank</span>
              <b>{rankOf(state.rank).name}</b>
            </div>
            <button className="res-go" onClick={onNewGame}>
              New Game (Humbly)
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="res-app">
      <Header state={state} bump={bump} />
      {online?.status}
      <BragTicker state={state} />

      {market && (
        <div className="res-banner" style={{ marginTop: 10 }}>
          {market.id === 'hotMarket'
            ? "🔥 HOT MARKET — buyers are making offers on houses they've only seen from the car."
            : '🧊 RATE SPIKE — everybody suddenly wants to “wait and see.”'}
        </div>
      )}
      {state.crash.weeksLeft > 0 && (
        <div className="res-banner res-crash">
          📉 MARKET CRASH — {state.crash.weeksLeft} weeks left. Everything is
          worth less. Everything is also cheaper.
        </div>
      )}
      <NominationBanner
        state={state}
        onOpen={() => {
          setTab('office')
          /* The picker lives in the Office tab; scroll once it has mounted. */
          requestAnimationFrame(() =>
            document
              .getElementById('goldies-table')
              ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
          )
        }}
      />
      {isPhase2Teaser(state) && (
        <div className="res-banner">
          🏆 Seller's Agent with six figures liquid.{' '}
          <b>To Be Continued in Phase 2.</b> Keep playing.
        </div>
      )}

      <nav className="res-tabs">
        {(online ? [...TABS, ['league', 'League'] as [TabId, string]] : TABS).map(([id, label]) => (
          <button
            key={id}
            className={'res-tab' + (tab === id ? ' on' : '')}
            onClick={() => setTab(id)}
          >
            {label}
            {id === 'today' && urgent > 0 && <span className="res-today-badge">{urgent}</span>}
            {id === 'leads' && state.leads.length
              ? ' (' + state.leads.length + ')'
              : ''}
          </button>
        ))}
      </nav>

      {tab === 'today' && <TodayTab briefing={briefing} dispatch={dispatch} go={setTab} />}
      {tab === 'office' && (
        <OfficeTab
          state={state}
          dispatch={dispatch}
          goToLeads={() => setTab('leads')}
          importText={importText}
          setImportText={setImportText}
          exported={exported}
          onExport={doExport}
          onImport={doImport}
          onNewGame={onNewGame}
          online={!!online}
        />
      )}
      {tab === 'marketing' && <MarketingTab state={state} dispatch={dispatch} />}
      {tab === 'leads' && <LeadsTab state={state} dispatch={dispatch} />}
      {tab === 'portfolio' && <PortfolioTab state={state} dispatch={dispatch} />}
      {tab === 'city' && <MapTab state={state} dispatch={dispatch} />}
      {tab === 'closet' && <ClosetTab state={state} dispatch={dispatch} />}
      {tab === 'log' && <LogTab state={state} />}
      {tab === 'league' && online?.league}

      {online?.endWeek ?? (
      <button
        className="res-end res-display"
        disabled={state.pendingChoices.length > 0 || state.call !== null}
        title={
          state.call !== null
            ? "You're on the phone."
            : state.pendingChoices.length > 0
              ? 'Decisions await'
              : ''
        }
        onClick={() => dispatch({ type: 'END_WEEK' })}
      >
        {state.call !== null
          ? 'ON THE PHONE'
          : state.pendingChoices.length > 0
            ? 'DECISIONS AWAIT'
            : 'END WEEK ' + state.week}
      </button>
      )}

      <CallModal state={state} dispatch={dispatch} />
      <PortfolioChoiceModal state={state} dispatch={dispatch} />

      {!state.call && state.postComposerPending && (
        <PostComposer state={state} dispatch={dispatch} />
      )}

      {showSummary && !state.postComposerPending && (
        <WeekSummaryModal
          state={state}
          extra={online?.summaryExtra}
          onClose={() => {
            setShowSummary(false)
            online?.onSummaryClosed?.()
          }}
        />
      )}

      {/* Never stacked: the Week Summary always reads first, and dismissing it
          is what raises the curtain on the Goldies. */}
      {!showSummary && !state.postComposerPending && state.ceremony && (
        <CeremonyModal state={state} dispatch={dispatch} />
      )}

      {confetti && (
        <div className="res-confetti">
          {Array.from({ length: 60 }).map((_, i) => (
            <i
              key={i}
              style={{
                left: ((i * 1.7) % 100) + '%',
                animationDelay: (i % 12) * 0.09 + 's',
                background: i % 3 === 0 ? '#f5f2ea' : '#c9a227',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
