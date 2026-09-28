import { useEffect, useRef, useState } from 'react'
import type { Leg } from '../../lib/legs'
import type { Trip } from '../engine/trip'
import { addNote, addPoints, clearTrack, parseGpx, photoUrl, removeNote, startRecording, stopRecording, useJournal, type Note } from '../journal'
import { filmSupported, makeFilm } from '../film'
import { useDio } from './Stage'
import { useApp } from '../store'
import { Icon, ICONS } from './common'

// "Our drive": the ribbon turns gold where you've actually been; notes and photos stay where they happened.

export default function Journal({ trip, legs }: { trip: Trip; legs: Record<string, Leg> }) {
  const j = useJournal()
  const dio = useDio()
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [film, setFilm] = useState<{ progress: number; url?: string; ext?: string } | null>(null)
  const cancel = useRef({ cancelled: false })

  const here = (): Promise<{ lon: number; lat: number }> =>
    new Promise((resolve) => {
      const fallback = () => {
        const v = dio?.getView()
        resolve({ lon: v?.lon ?? 14.5, lat: v?.lat ?? 46 })
      }
      if (!('geolocation' in navigator)) return fallback()
      navigator.geolocation.getCurrentPosition((p) => resolve({ lon: p.coords.longitude, lat: p.coords.latitude }), fallback, { timeout: 8000, maximumAge: 60000 })
    })

  const save = async () => {
    if (!text.trim() && !file) return
    setBusy(true)
    const at = await here()
    await addNote({ ...at, text: text.trim() }, file ?? undefined)
    setText('')
    setFile(null)
    setBusy(false)
  }

  const importGpx = async (f: File) => {
    const pts = parseGpx(await f.text())
    addPoints(pts)
  }

  const shoot = async () => {
    if (!dio) return
    cancel.current = { cancelled: false }
    setFilm({ progress: 0 })
    const blob = await makeFilm(dio, trip, legs, { seconds: 90, notes: j.notes, settings: useApp.getState().plan.settings, onProgress: (p) => setFilm((f) => ({ ...f, progress: p })), signal: cancel.current })
    if (!blob) return setFilm(null)
    setFilm({ progress: 1, url: URL.createObjectURL(blob), ext: blob.type.includes('mp4') ? 'mp4' : 'webm' })
  }

  return (
    <section className="panel__body journal" aria-labelledby="j-h">
      <p className="kicker">Our drive</p>
      <h2 id="j-h">The route remembers</h2>
      <p className="lede">While the app is open on the road, the ribbon turns gold wherever you’ve actually driven. Drop a note or a photo anywhere — it stays pinned there. Nothing leaves this phone.</p>
      <div className="journal__rec">
        <button type="button" className={`btn ${j.recording ? 'btn--on' : 'btn--primary'}`} onClick={() => (j.recording ? stopRecording() : startRecording())} aria-pressed={j.recording}>
          <span className={`recdot ${j.recording ? 'is-on' : ''}`} aria-hidden="true" /> {j.recording ? 'Recording our drive' : 'Record our drive (GPS)'}
        </button>
        <label className="btn btn--ghost">
          Import a GPX track
          <input type="file" accept=".gpx,application/gpx+xml" hidden onChange={(e) => e.target.files?.[0] && importGpx(e.target.files[0])} />
        </label>
      </div>
      {j.error && <p className="warn">{j.error}</p>}
      <p className="muted">
        {j.track.length ? `${Math.round(j.km).toLocaleString('en-GB')} km remembered so far.` : 'Nothing driven yet.'}{' '}
        {j.track.length > 0 && (
          <button type="button" className="linkbtn" onClick={() => confirm('Forget the recorded track?') && clearTrack()}>
            forget track
          </button>
        )}
      </p>

      <h3 className="h3">Leave a note here</h3>
      <div className="journal__note">
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Best coffee of the trip…" rows={2} />
        <div className="journal__noteRow">
          <label className="btn btn--ghost btn--small">
            <Icon d={ICONS.camera} size={14} /> {file ? file.name.slice(0, 18) : 'Photo'}
            <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <button type="button" className="btn btn--primary btn--small" onClick={save} disabled={busy || (!text.trim() && !file)}>
            {busy ? 'Pinning…' : 'Pin it here'}
          </button>
        </div>
      </div>
      <ul className="notes">
        {[...j.notes].reverse().map((n) => (
          <NoteRow key={n.id} n={n} onShow={() => dio?.flyTo({ lon: n.lon, lat: n.lat, dist: 20, tilt: 55 }, 1800)} />
        ))}
      </ul>

      <h3 className="h3">Our film</h3>
      <p className="muted">A 90-second fly-over of the whole trip — the sun moving through each day, your photos where you took them.</p>
      {!filmSupported() && <p className="warn">This browser can’t record video from the page.</p>}
      {filmSupported() && !film && (
        <button type="button" className="btn btn--ghost" onClick={shoot}>
          <Icon d={ICONS.film} size={16} /> Make our film
        </button>
      )}
      {film && !film.url && (
        <p>
          Filming… {Math.round(film.progress * 100)}%{' '}
          <button type="button" className="linkbtn" onClick={() => { cancel.current.cancelled = true; dio?.stopFly() }}>
            stop
          </button>
        </p>
      )}
      {film?.url && (
        <p>
          <a className="btn btn--primary" href={film.url} download={`soton-slovenia-2027.${film.ext}`}>
            Download the film
          </a>{' '}
          <button type="button" className="linkbtn" onClick={() => setFilm(null)}>
            make another
          </button>
        </p>
      )}
    </section>
  )
}

function NoteRow({ n, onShow }: { n: Note; onShow: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (n.photo) photoUrl(n.photo).then(setUrl)
  }, [n.photo])
  return (
    <li className="note">
      {url && <img src={url} alt="" />}
      <div>
        <p>{n.text || 'Photo'}</p>
        <small>{new Date(n.t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>{' '}
        <button type="button" className="linkbtn" onClick={onShow}>
          show
        </button>{' '}
        <button type="button" className="linkbtn" onClick={() => confirm('Delete this note?') && removeNote(n.id)}>
          delete
        </button>
      </div>
    </li>
  )
}
