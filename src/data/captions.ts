import type { CaptionDef } from '../state/types'

export const CAPTIONS: CaptionDef[] = [
  {
    id: 'professional',
    label: 'Professional',
    repMult: 1.2,
    viralDelta: -0.05,
    embarrassDelta: -0.08,
    egoDelta: 0,
    text: 'Clean, factual, three hashtags maximum. Your mother would approve.',
  },
  {
    id: 'humble',
    label: 'Humble-Brag',
    repMult: 1.0,
    viralDelta: 0.03,
    embarrassDelta: 0.03,
    egoDelta: 1,
    text: "'Still can't believe this is my JOB 🥹' (you can believe it; it's been eleven years).",
  },
  {
    id: 'hustle',
    label: 'Hustle-Guru',
    repMult: 0.9,
    viralDelta: 0.08,
    embarrassDelta: 0.12,
    egoDelta: 2,
    text: "'Most of you will scroll past this. That's WHY you're not closing.' 🔥",
  },
  {
    id: 'unhinged',
    label: 'Fully Unhinged',
    repMult: 0.8,
    viralDelta: 0.15,
    embarrassDelta: 0.18,
    egoDelta: 3,
    text: 'All caps. Nine hashtags. A prediction about interest rates you cannot back up.',
  },
]

export const captionOf = (id: string): CaptionDef | undefined =>
  CAPTIONS.find((c) => c.id === id)
