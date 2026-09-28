import { Anchor } from './Stage'

// Engraved-style names on the land and sea, like a relief model in a museum. Only at overview scale.

const NAMES: [string, number, number, 'country' | 'region' | 'sea', number?][] = [
  ['France', 46.9, 2.6, 'country'],
  ['Germany', 50.9, 10.3, 'country'],
  ['Switzerland', 46.95, 8.1, 'country', 700],
  ['Austria', 47.75, 14.3, 'country'],
  ['Italy', 44.3, 11.6, 'country'],
  ['Belgium', 50.55, 4.6, 'country', 900],
  ['Netherlands', 52.2, 5.6, 'country', 900],
  ['Czechia', 49.8, 15.3, 'country'],
  ['Slovenia', 45.85, 14.9, 'country', 700],
  ['England', 51.9, -1.6, 'country'],
  ['Croatia', 45.3, 15.9, 'country', 900],
  ['The Alps', 46.35, 9.3, 'region', 450],
  ['Dolomites', 46.45, 11.95, 'region', 250],
  ['Black Forest', 48.2, 8.1, 'region', 300],
  ['Jura', 46.9, 6.3, 'region', 300],
  ['Vosges', 48.2, 6.95, 'region', 300],
  ['Po Valley', 45.1, 10.4, 'region', 350],
  ['Salzkammergut', 47.7, 13.55, 'region', 200],
  ['Ardennes', 50.2, 5.4, 'region', 300],
  ['English Channel', 50.25, -1.7, 'sea'],
  ['North Sea', 52.9, 3.2, 'sea'],
  ['Adriatic Sea', 44.1, 13.9, 'sea'],
  ['Ligurian Sea', 43.6, 8.6, 'sea'],
  ['Bay of Biscay', 45.2, -3.4, 'sea'],
]

export function Lettering() {
  return (
    <>
      {NAMES.map(([name, lat, lon, kind, min]) => (
        <Anchor key={name} id={`name-${name}`} lon={lon} lat={lat} lift={kind === 'sea' ? 0 : 2500} minDist={min ?? 500} priority={-1}>
          <span className={`letter letter--${kind}`}>{name}</span>
        </Anchor>
      ))}
    </>
  )
}
