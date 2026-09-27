const dtf = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const dtfLong = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

export const fmtDate = (iso: string) => dtf.format(new Date(iso + 'T12:00:00Z'))
export const fmtDateLong = (iso: string) => dtfLong.format(new Date(iso + 'T12:00:00Z'))
export const fmtKm = (km: number) => `${Math.round(km).toLocaleString('en-GB')} km`
export function fmtH(h: number): string {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  if (mm === 60) return `${hh + 1} h`
  return hh ? `${hh} h ${mm.toString().padStart(2, '0')}` : `${mm} min`
}
export const fmtEur = (e: number) => `€${Math.round(e).toLocaleString('en-GB')}`
export const fmtM = (m: number) => `${Math.round(m).toLocaleString('en-GB')} m`
export const fmtAgo = (iso: string) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
