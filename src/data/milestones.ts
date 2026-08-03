import type { MilestoneDef } from '../state/types'

/* Perks are applied by id in logic/portfolio.ts:
   mogul250 + sevenFig → +1 mortgage slot each
   portfolioGuy       → Market Insight (the dial's ghost needle)
   genWealth          → renovations take one week less */
export const MILESTONES: MilestoneDef[] = [
  {
    id: 'mogul250',
    threshold: 250000,
    label: 'Technically a Mogul',
    line: "Net worth: a quarter million. You said 'portfolio' out loud at a barbecue and meant it.",
  },
  {
    id: 'portfolioGuy',
    threshold: 500000,
    label: 'Portfolio Guy',
    line: "Half a million. Your accountant asked if you're 'doing okay emotionally.'",
  },
  {
    id: 'sevenFig',
    threshold: 1000000,
    label: 'Seven Figures (Gross)',
    line: 'MILLIONAIRE (on paper) (the paper is mortgaged) (still counts).',
  },
  {
    id: 'genWealth',
    threshold: 2500000,
    label: 'Generational Wealth (Self-Described)',
    line: "You now say 'my guy' about four different tradespeople. To Be Continued in Phase 4.",
  },
]
