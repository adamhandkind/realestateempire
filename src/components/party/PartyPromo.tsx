/* The main game's Land Grab tab. Land Grab is a party game now, played on a
   big screen with everyone on their phone, so this just points the way. */

import { WIN_POINTS } from '../../board/data'

export default function PartyPromo() {
  return (
    <div className="res-panel dark" style={{ maxWidth: 640 }}>
      <p className="res-eyebrow">The party board game · 18+</p>
      <h2 className="res-display">Land Grab</h2>
      <p>
        Two to four of you fight over one filthy city. The board goes on a big screen, everyone plays on their own phone, and the
        bots fill empty seats. About 45 minutes, first to {WIN_POINTS} Empire Points.
      </p>
      <ol style={{ lineHeight: 1.6, paddingLeft: 20 }}>
        <li>
          On the big screen (a laptop on the TV, or a console’s browser), open <b>{window.location.host}/tv</b> while signed in.
        </li>
        <li>Tick the 18+ box and start a room.</li>
        <li>Everyone scans the QR code with their phone, picks a name and a colour, and you’re playing.</li>
      </ol>
      <a className="res-go" href="/tv" target="_blank" rel="noreferrer" style={{ display: 'inline-block', textDecoration: 'none' }}>
        Open the big screen
      </a>
    </div>
  )
}
