import { useEffect, useReducer, useRef, useState } from 'react'
import BragTicker from './components/BragTicker'
import CharacterSelect from './components/CharacterSelect'
import ClosetTab from './components/ClosetTab'
import Header from './components/Header'
import LeadsTab from './components/LeadsTab'
import LogTab from './components/LogTab'
import MapTab from './components/MapTab'
import OfficeTab from './components/OfficeTab'
import PortfolioChoiceModal from './components/PortfolioChoiceModal'
import PortfolioTab from './components/PortfolioTab'
import WeekSummaryModal from './components/WeekSummaryModal'
import { activeModifierDelta, isPhase2Teaser, rankOf } from './logic/economy'
import { money } from './logic/rand'
import { initialState, reducer } from './state/reducer'
import { loadSave, parseImport, serialize, writeSave } from './state/save'

type TabId = 'office' | 'leads' | 'portfolio' | 'city' | 'closet' | 'log'

const TABS: [TabId, string][] = [
  ['office', 'Office'],
  ['leads', 'Leads'],
  ['portfolio', 'Portfolio'],
  ['city', 'City'],
  ['closet', 'Closet'],
  ['log', 'Log'],
]

export default function App() {
  const saved = useRef(loadSave())
  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    () => saved.current || initialState(),
  )
  /* No save means no agent has been chosen yet. Game over → New Game comes
     back here too, so the next run can be somebody else entirely. */
  const [choosing, setChoosing] = useState(!saved.current)
  const [tab, setTab] = useState<TabId>('office')
  const [showSummary, setShowSummary] = useState(false)
  const [confetti, setConfetti] = useState(false)
  const [importText, setImportText] = useState('')
  const [exported, setExported] = useState('')
  const [bump, setBump] = useState(false)
  const prevCash = useRef(state.cash)

  useEffect(() => {
    if (!choosing) writeSave(state)
  }, [state, choosing])

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

  const modDelta = activeModifierDelta(state)

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

  if (choosing) {
    return (
      <CharacterSelect
        onStart={(characterId) => {
          dispatch({ type: 'NEW_GAME', characterId })
          setChoosing(false)
        }}
      />
    )
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
            <button className="res-go" onClick={() => setChoosing(true)}>
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
      <BragTicker state={state} />

      {modDelta !== 0 && (
        <div className="res-banner" style={{ marginTop: 10 }}>
          {modDelta > 0
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
      {isPhase2Teaser(state) && (
        <div className="res-banner">
          🏆 Seller's Agent with six figures liquid.{' '}
          <b>To Be Continued in Phase 2.</b> Keep playing.
        </div>
      )}

      <nav className="res-tabs">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            className={'res-tab' + (tab === id ? ' on' : '')}
            onClick={() => setTab(id)}
          >
            {label}
            {id === 'leads' && state.leads.length
              ? ' (' + state.leads.length + ')'
              : ''}
          </button>
        ))}
      </nav>

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
          onNewGame={() => setChoosing(true)}
        />
      )}
      {tab === 'leads' && <LeadsTab state={state} dispatch={dispatch} />}
      {tab === 'portfolio' && <PortfolioTab state={state} dispatch={dispatch} />}
      {tab === 'city' && <MapTab state={state} dispatch={dispatch} />}
      {tab === 'closet' && <ClosetTab state={state} dispatch={dispatch} />}
      {tab === 'log' && <LogTab state={state} />}

      <button
        className="res-end res-display"
        disabled={state.pendingChoices.length > 0}
        title={state.pendingChoices.length > 0 ? 'Decisions await' : ''}
        onClick={() => dispatch({ type: 'END_WEEK' })}
      >
        {state.pendingChoices.length > 0
          ? 'DECISIONS AWAIT'
          : 'END WEEK ' + state.week}
      </button>

      <PortfolioChoiceModal state={state} dispatch={dispatch} />

      {showSummary && (
        <WeekSummaryModal state={state} onClose={() => setShowSummary(false)} />
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
