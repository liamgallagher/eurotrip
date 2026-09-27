import { useState } from 'react'
import { motion } from 'motion/react'
import { shareUrl, openedFromShare } from '../store'
import type { TripModel } from '../hooks'
import { ROUTE_BY_ID } from '../data/routes'
import { fmtDate } from '../ui/format'

const NAV = [
  ['compare', 'Compare'],
  ['plan', 'Plan'],
  ['map', 'Map'],
  ['days', 'Days'],
  ['charging', 'Charging'],
  ['costs', 'Costs'],
  ['checklist', 'Checklist'],
  ['excluded', 'Excluded'],
]

export function Masthead({ model }: { model: TripModel }) {
  const { plan, state } = model
  const [copied, setCopied] = useState(false)
  const ok = plan.totalNights === 14
  const share = async () => {
    const url = shareUrl()
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: 'Our road trip plan', url })
        return
      }
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {
      window.prompt('Copy this link:', url)
    }
  }
  return (
    <>
      <nav className="topbar" aria-label="Sections">
        <div className="wrap topbar__in">
          <a className="brand" href="#top">
            <span className="brand__mark" aria-hidden="true">⇄</span>
            <span>Soton<span className="brand__x">×</span>Ljubljana</span>
          </a>
          <ul className="topbar__nav">
            {NAV.map(([id, l]) => (
              <li key={id}>
                <a href={`#${id}`}>{l}</a>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn--share" onClick={share}>
            {copied ? 'Link copied ✓' : 'Share plan'}
          </button>
        </div>
      </nav>
      <header className="hero" id="top">
        <div className="wrap hero__in">
          <div>
          <motion.p className="kicker" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            A fortnight by road · {fmtDate(state.startDate)} – {fmtDate(plan.endDate)} {state.startDate.slice(0, 4)}
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            The drive <em>is</em> the holiday.
          </motion.h1>
          <motion.p className="hero__lede" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
            Southampton to Ljubljana and back in the Model 3 — one road there, a different road home. Choose them by what you'll see on the way.
          </motion.p>
          </div>
          <motion.div className="hero__plan" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <span className="dir dir--out">Out</span> <b>R{ROUTE_BY_ID[state.out.route].num} {ROUTE_BY_ID[state.out.route].short}</b>
            <span className="hero__sep" aria-hidden="true">·</span>
            <span className="dir dir--ret">Back</span> <b>R{ROUTE_BY_ID[state.ret.route].num} {ROUTE_BY_ID[state.ret.route].short}</b>
            <span className="hero__sep" aria-hidden="true">·</span>
            <span className={`nights ${ok ? 'is-ok' : 'is-warn'}`}>
              {plan.totalNights} nights {ok ? '✓' : '⚠'}
            </span>
            {openedFromShare && <span className="tag">opened from a shared link</span>}
          </motion.div>
        </div>
      </header>
    </>
  )
}
