import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App.tsx'

/* No <StrictMode> on purpose. StrictMode double-invokes reducers in dev, and
   this reducer draws from rand() — so a dev session would burn RNG at twice the
   rate of the Phase 1 build it is meant to reproduce. The single-file original
   had no StrictMode either. Revisit in Phase 2 if the reducer is ever made pure
   (e.g. by threading the RNG through the action). */
createRoot(document.getElementById('root')!).render(<App />)
