import { useEffect } from 'react'
import { create } from 'zustand'
import { del, get, set as idbSet } from 'idb-keyval'
import { fastDist } from '../lib/geo'

// "The route remembers": where you've actually driven (GPS while the app is open, or an imported GPX track)
// plus notes and photos pinned where they happened. Everything stays in this browser (IndexedDB).

export interface Note {
  id: string
  lon: number
  lat: number
  t: number
  text: string
  photo?: string
}

type Pt = [number, number, number] // lon, lat, time

interface JournalStore {
  track: Pt[]
  notes: Note[]
  version: number
  recording: boolean
  error: string | null
  loaded: boolean
}

const useJ = create<JournalStore>(() => ({ track: [], notes: [], version: 0, recording: false, error: null, loaded: false }))

// spatial hash of driven points: 0.01° cells (~1 km)
let grid = new Map<string, Pt[]>()
const cell = (lon: number, lat: number) => `${Math.floor(lon * 100)}:${Math.floor(lat * 100)}`
function index(track: Pt[]) {
  grid = new Map()
  for (const p of track) {
    const k = cell(p[0], p[1])
    const l = grid.get(k)
    if (l) l.push(p)
    else grid.set(k, [p])
  }
}

export function driven(lon: number, lat: number): boolean {
  const cx = Math.floor(lon * 100), cy = Math.floor(lat * 100)
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    for (const p of grid.get(`${cx + dx}:${cy + dy}`) ?? []) if (fastDist([lon, lat], [p[0], p[1]]) < 450) return true
  }
  return false
}

async function load() {
  if (useJ.getState().loaded) return
  try {
    const [track, notes] = await Promise.all([get<Pt[]>('journal:track'), get<Note[]>('journal:notes')])
    index(track ?? [])
    useJ.setState((s) => ({ track: track ?? [], notes: notes ?? [], loaded: true, version: s.version + 1 }))
  } catch {
    useJ.setState({ loaded: true })
  }
}

let saveT: ReturnType<typeof setTimeout> | undefined
function persist() {
  clearTimeout(saveT)
  saveT = setTimeout(() => {
    const { track, notes } = useJ.getState()
    idbSet('journal:track', track).catch(() => undefined)
    idbSet('journal:notes', notes).catch(() => undefined)
  }, 800)
}

export function addPoints(pts: Pt[]) {
  const s = useJ.getState()
  const track = [...s.track]
  let last = track[track.length - 1]
  for (const p of pts) {
    if (last && fastDist([last[0], last[1]], [p[0], p[1]]) < 120) continue
    track.push(p)
    last = p
  }
  index(track)
  useJ.setState({ track, version: s.version + 1 })
  persist()
}

let watchId: number | null = null
export function startRecording() {
  if (!('geolocation' in navigator)) {
    useJ.setState({ error: 'This browser has no GPS access.' })
    return
  }
  if (watchId != null) return
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      if (pos.coords.accuracy > 150) return
      addPoints([[pos.coords.longitude, pos.coords.latitude, pos.timestamp]])
      useJ.setState({ error: null })
    },
    (err) => useJ.setState({ error: err.code === 1 ? 'Location permission was refused.' : 'No GPS fix yet.' }),
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 },
  )
  useJ.setState({ recording: true })
  try {
    localStorage.setItem('eurotrip:recording', '1')
  } catch { /* ignore */ }
}

export function stopRecording() {
  if (watchId != null) navigator.geolocation.clearWatch(watchId)
  watchId = null
  useJ.setState({ recording: false })
  try {
    localStorage.removeItem('eurotrip:recording')
  } catch { /* ignore */ }
}

/** Read a GPX file's track points (trkpt / rtept). */
export function parseGpx(text: string): Pt[] {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  const out: Pt[] = []
  doc.querySelectorAll('trkpt, rtept').forEach((el) => {
    const lat = Number(el.getAttribute('lat')), lon = Number(el.getAttribute('lon'))
    const t = Date.parse(el.querySelector('time')?.textContent ?? '') || 0
    if (Number.isFinite(lat) && Number.isFinite(lon)) out.push([lon, lat, t])
  })
  return out
}

async function downscale(file: File, max = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k)
  c.height = Math.round(bmp.height * k)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.85))
}

export async function addNote(n: Omit<Note, 'id' | 't' | 'photo'>, photo?: File) {
  const id = `n${Date.now().toString(36)}`
  let key: string | undefined
  if (photo) {
    key = `journal:photo:${id}`
    await idbSet(key, await downscale(photo))
  }
  useJ.setState((s) => ({ notes: [...s.notes, { ...n, id, t: Date.now(), photo: key }], version: s.version + 1 }))
  persist()
}

export async function removeNote(id: string) {
  const n = useJ.getState().notes.find((x) => x.id === id)
  if (n?.photo) await del(n.photo).catch(() => undefined)
  useJ.setState((s) => ({ notes: s.notes.filter((x) => x.id !== id), version: s.version + 1 }))
  persist()
}

export async function clearTrack() {
  index([])
  useJ.setState((s) => ({ track: [], version: s.version + 1 }))
  persist()
}

const urls = new Map<string, string>()
export async function photoUrl(key: string): Promise<string | null> {
  const hit = urls.get(key)
  if (hit) return hit
  const b = await get<Blob>(key)
  if (!b) return null
  const u = URL.createObjectURL(b)
  urls.set(key, u)
  return u
}

export function useJournal() {
  const s = useJ()
  useEffect(() => {
    load()
    try {
      if (localStorage.getItem('eurotrip:recording') === '1') startRecording()
    } catch { /* ignore */ }
  }, [])
  const km = s.track.reduce((a, p, i) => (i ? a + fastDist([s.track[i - 1][0], s.track[i - 1][1]], [p[0], p[1]]) / 1000 : 0), 0)
  return { ...s, km, driven: s.track.length ? driven : undefined }
}
