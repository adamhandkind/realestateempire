/* One colour per player in a shared city: yard signs, flags and the agent
   on the map (Phase 3). Ten players, ten colours, none of them a rival's
   (burgundy, navy, orchid). */

export const AGENT_COLORS: { id: string; name: string; hex: string }[] = [
  { id: 'coral', name: 'Commission Coral', hex: '#e8573f' },
  { id: 'gold', name: 'Gold Plated', hex: '#e0b100' },
  { id: 'lime', name: 'Lawn Sign Lime', hex: '#7bc142' },
  { id: 'teal', name: 'Pool Deck Teal', hex: '#1fa6a0' },
  { id: 'sky', name: 'Open House Blue', hex: '#3d8fe0' },
  { id: 'violet', name: 'Staging Violet', hex: '#8a5cf0' },
  { id: 'magenta', name: 'Billboard Magenta', hex: '#e04aa8' },
  { id: 'orange', name: 'SOLD Orange', hex: '#f08a24' },
  { id: 'mint', name: 'Fresh Paint Mint', hex: '#4fd1a1' },
  { id: 'pearl', name: 'Model Home Pearl', hex: '#e9e4d8' },
]
