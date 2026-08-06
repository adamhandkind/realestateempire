import { useState } from 'react'
import type { Dispatch } from 'react'
import { POSTS, postOf } from '../data/posts'
import { CAPTIONS, captionOf } from '../data/captions'
import { activeCrew, computeChances, CREW_INDEX } from '../logic/content'
import { crewOf, P9 } from '../data/crew'
import type { Action, GameState, PostDef } from '../state/types'

export default function PostComposer({
  state,
  dispatch,
}: {
  state: GameState
  dispatch: Dispatch<Action>
}) {
  const [postId, setPostId] = useState<string | null>(null)
  const [captionId, setCaptionId] = useState<string>('professional')

  if (!state.postComposerPending) return null

  const crew = activeCrew(state)
  const post = postId ? postOf(postId) : null
  const caption = captionOf(captionId)!

  const available = (p: PostDef) =>
    CREW_INDEX[state.unlockedCrew] >= CREW_INDEX[p.crewRequired]

  const preview = post && caption ? computeChances(state, post, caption) : null
  const trophyDisplayed =
    post?.id === 'humbledAward' &&
    (state.trophies ?? []).some((t) => t.displayed)
  const effRepBase = post
    ? trophyDisplayed
      ? post.baseEffects.rep * 2
      : post.baseEffects.rep
    : 0
  const repDelta =
    post && caption
      ? effRepBase > 0
        ? Math.round(effRepBase * caption.repMult)
        : effRepBase
      : 0
  const egoDelta = post ? post.egoBias + caption.egoDelta : 0
  const variance = post
    ? Math.min(
        1,
        post.viralMod + post.embarrassMod + caption.viralDelta + caption.embarrassDelta,
      )
    : 0
  const varianceWord =
    variance < 0.1 ? 'Safe' : variance < 0.3 ? 'Spicy' : 'Chaotic'

  return (
    <div className="res-modal">
      <div className="res-card res-composer">
        <div className="res-composer-head">
          <h2 className="res-display">📱 THIS WEEK'S POST</h2>
          <div className="res-chips">
            <span className="res-chip">Rep {state.reputation}</span>
            <span className="res-chip">Ego {state.stats.ego}</span>
            <span className="res-chip">{crew.label}</span>
          </div>
        </div>

        {!post ? (
          <div className="res-post-grid">
            {POSTS.map((p) => {
              const ok = available(p)
              return (
                <button
                  key={p.id}
                  className={'res-post-card' + (ok ? '' : ' locked')}
                  disabled={!ok}
                  onClick={() => ok && setPostId(p.id)}
                >
                  <b>{p.label}</b>
                  <span className="res-post-blurb">{p.blurb}</span>
                  {ok ? (
                    <span className="res-post-hints">
                      🎯 {p.baseEffects.leads} · 📈{' '}
                      {p.baseEffects.rep >= 0 ? '+' : ''}
                      {p.baseEffects.rep} · 🎲{' '}
                      {'▮'.repeat(
                        Math.max(
                          1,
                          Math.round((p.viralMod + p.embarrassMod) * 10),
                        ),
                      )}
                    </span>
                  ) : (
                    <span className="res-post-lock">
                      Needs {crewOf(p.crewRequired).label}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ) : (
          <>
            <div className="res-caption-row">
              {CAPTIONS.map((c) => (
                <button
                  key={c.id}
                  className={'res-caption' + (c.id === captionId ? ' on' : '')}
                  onClick={() => setCaptionId(c.id)}
                >
                  <b>{c.label}</b>
                  <span>{c.text}</span>
                  <span className="res-caption-fx">
                    rep ×{c.repMult} · viral {c.viralDelta >= 0 ? '+' : ''}
                    {c.viralDelta} · 💀 {c.embarrassDelta >= 0 ? '+' : ''}
                    {c.embarrassDelta} · ego +{c.egoDelta}
                  </span>
                </button>
              ))}
            </div>

            <div className="res-preview">
              <div className="res-preview-post">
                <b>{post.label}</b>
                <p>{caption.text}</p>
              </div>
              <div className="res-preview-deltas">
                <span>
                  Rep {repDelta >= 0 ? '+' : ''}
                  {repDelta}
                </span>
                <span>Ego +{egoDelta}</span>
                <span>
                  Variance: {varianceWord}
                  {preview
                    ? ` (📈 ${Math.round(preview.viral * 100)}% · 💀 ${Math.round(
                        preview.embarrass * 100,
                      )}%)`
                    : ''}
                </span>
              </div>
            </div>

            <div className="res-composer-actions">
              <button className="res-tactic" onClick={() => setPostId(null)}>
                Back
              </button>
              <button
                className="res-go"
                onClick={() =>
                  dispatch({ type: 'CREATE_POST', postId: post.id, captionId })
                }
              >
                Post it
              </button>
            </div>
          </>
        )}

        <button
          className="res-skip"
          onClick={() => {
            if (
              state.contentStats.skipStreak + 1 >= P9.SKIP_STREAK_TRIGGER &&
              !window.confirm('Skipping again? People forget.')
            )
              return
            dispatch({ type: 'SKIP_POST' })
          }}
        >
          Skip this week
        </button>
      </div>
    </div>
  )
}
