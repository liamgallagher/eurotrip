import { useState, type ReactNode } from 'react'
import type { Category, MayStatus } from '../data/types'
import { MAY_LABEL } from '../lib/scoring'
import photosJson from '../data/photos.json'
import pexelsJson from '../data/pexels.json'

export const CAT_COLOR: Record<Category, string> = {
  'scenic-road': '#2a78d6',
  pass: '#4a3aa7',
  lake: '#169a6b',
  town: '#eb6834',
  landmark: '#c98500',
  'food-wine': '#d55181',
  history: '#008300',
}

export const CAT_ICON: Record<Category, string> = {
  'scenic-road': 'M3 20c4-2 5-8 9-8s5 6 9 8',
  pass: 'M2 20 9 7l4 6 3-4 6 11z',
  lake: 'M2 15c3-2 5 2 8 0s5-2 8 0 3 1 4 0M2 19c3-2 5 2 8 0s5-2 8 0 3 1 4 0',
  town: 'M3 21V10l5-4 5 4v11M13 21V7l4-3 4 3v14M6 14h4M16 10h2M16 14h2',
  landmark: 'M12 3 4 8h16zM6 10v8M10 10v8M14 10v8M18 10v8M3 21h18',
  'food-wine': 'M8 3h8l-1 7a3 3 0 0 1-6 0zM12 13v7M8 21h8',
  history: 'M4 21V9l8-5 8 5v12M9 21v-6h6v6',
}

export function CatIcon({ c, size = 14 }: { c: Category; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={CAT_ICON[c]} />
    </svg>
  )
}

export function MayBadge({ may, title }: { may: MayStatus; title?: string }) {
  return (
    <span className={`may may--${may}`} title={title}>
      <span className="may__dot" aria-hidden="true" />
      {MAY_LABEL[may]}
    </span>
  )
}

export function ScenicDots({ v }: { v: number }) {
  return (
    <span className="dots" aria-label={`Scenic score ${v} out of 10`} title={`Scenic ${v}/10 (editorial)`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={`dots__d ${v >= (i + 1) * 2 ? 'is-full' : v >= i * 2 + 1 ? 'is-half' : ''}`} />
      ))}
    </span>
  )
}

export function Stepper({ value, onChange, min = 0, max = 10, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string }) {
  return (
    <span className="stepper" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Fewer ${label}`}>−</button>
      <output aria-live="polite">{value}</output>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More ${label}`}>+</button>
    </span>
  )
}

export function SectionHead({ kicker, title, children, id }: { kicker: string; title: string; children?: ReactNode; id?: string }) {
  return (
    <header className="section-head">
      <p className="kicker">{kicker}</p>
      <h2 id={id}>{title}</h2>
      {children && <div className="section-head__lede">{children}</div>}
    </header>
  )
}

export function Estimate({ children = 'estimate' }: { children?: ReactNode }) {
  return <span className="est" title="Modelled or approximate — not a verified fact">{children}</span>
}

export function SourceLinks({ sources, checked }: { sources: { label: string; url: string }[]; checked?: string }) {
  if (!sources.length && !checked) return null
  return (
    <span className="sources">
      {sources.map((s, i) => (
        <a key={i} href={s.url} target="_blank" rel="noreferrer">
          {s.label}
        </a>
      ))}
      {checked && <span className="sources__checked">checked {checked}</span>}
    </span>
  )
}

interface PhotoMeta {
  file: string
  src: string
  local?: string
  w: number
  h: number
  page: string
  author: string
  license: string
}
interface PexelsMeta {
  pexelsId: number
  src: string
  w: number
  h: number
  page: string
  photographer: string
  photographerUrl: string
  color: string
  alt: string
}
const PHOTOS = (photosJson as { photos: Record<string, PhotoMeta> }).photos
const PEXELS = (pexelsJson as { photos: Record<string, PexelsMeta> }).photos

export function photoFor(id: string): PhotoMeta | undefined {
  return PHOTOS[id]
}

interface Source {
  src: string
  srcSet?: string
  w: number
  h: number
  credit: string
  creditUrl: string
  title: string
  color?: string
}

/** Candidate image sources, best first: Pexels (professional, large) → Wikimedia HD → local 500px copy. */
function sourcesFor(id: string, hd: boolean): Source[] {
  const out: Source[] = []
  const px = PEXELS[id]
  if (px) {
    const u = (w: number) => `${px.src}?auto=compress&cs=tinysrgb&w=${w}`
    out.push({
      src: u(hd ? 1600 : 800),
      srcSet: hd ? `${u(800)} 800w, ${u(1280)} 1280w, ${u(1920)} 1920w, ${u(2560)} 2560w` : `${u(480)} 480w, ${u(800)} 800w, ${u(1200)} 1200w`,
      w: px.w, h: px.h, credit: `${px.photographer} / Pexels`, creditUrl: px.page, title: `Photo by ${px.photographer} on Pexels`, color: px.color,
    })
  }
  const p = PHOTOS[id]
  if (p) {
    const credit = `${p.author.length > 28 ? p.author.slice(0, 26) + '…' : p.author} · ${p.license}`
    const title = `${p.author} · ${p.license} · Wikimedia Commons`
    const w1280 = p.src.replace('/960px-', '/1280px-')
    const local = p.local ? `${import.meta.env.BASE_URL}${p.local}` : null
    // small images come from our own 500px copy; large ones from Wikimedia at up to 1280px
    if (!hd && local) out.push({ src: local, w: p.w, h: p.h, credit, creditUrl: p.page, title })
    out.push({ src: hd ? w1280 : p.src, srcSet: `${local ?? p.src.replace('/960px-', '/500px-')} 500w, ${p.src} 960w, ${w1280} 1280w`, w: p.w, h: p.h, credit, creditUrl: p.page, title })
    if (hd && local) out.push({ src: local, w: p.w, h: p.h, credit, creditUrl: p.page, title })
  }
  return out
}

/** Large, credited photo with graceful fallbacks. `hd` requests a large image (hero/gallery use). */
export function Photo({ id, alt, className = '', category, eager = false, hd = false, sizes }: { id: string; alt: string; sizes?: string; className?: string; category?: Category; eager?: boolean; hd?: boolean }) {
  const [attempt, setAttempt] = useState(0)
  const cands = sourcesFor(id, hd)
  const c = cands[attempt]
  if (!c) {
    return (
      <div className={`photo photo--empty ${className}`} style={{ ['--c' as string]: category ? CAT_COLOR[category] : '#8a8170' }} role="img" aria-label={`${alt} (no photo available)`}>
        {category && <CatIcon c={category} size={28} />}
      </div>
    )
  }
  return (
    <figure className={`photo ${className}`} style={c.color ? { background: c.color } : undefined}>
      <img
        key={c.src}
        src={c.src}
        srcSet={c.srcSet}
        sizes={sizes ?? (hd ? '(max-width: 760px) 100vw, 900px' : '(max-width: 760px) 50vw, 320px')}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        width={c.w}
        height={c.h}
        onError={() => setAttempt((a) => a + 1)}
      />
      <figcaption>
        <a href={c.creditUrl} target="_blank" rel="noreferrer" title={c.title}>
          © {c.credit}
        </a>
      </figcaption>
    </figure>
  )
}

/** Opens Google Images for a place in a new tab (nothing is copied into the app). */
export const googleImagesUrl = (q: string) => `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}`
export const googleMapsSearchUrl = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
