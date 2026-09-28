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

/** [name, lat, lon, major] */
export const COUNTRY_LABELS: [string, number, number, boolean][] = NAMES.filter((n) => n[3] === 'country').map(([name, lat, lon, , min]) => [name, lat, lon, !min])

// Cities (tier 1 shows further out) and the big peaks, for finding your way when close in.
const CITIES: [string, number, number, 1 | 2][] = [
  ['London', 51.507, -0.128, 1], ['Paris', 48.857, 2.352, 1], ['Brussels', 50.847, 4.357, 1], ['Amsterdam', 52.373, 4.894, 1],
  ['Luxembourg', 49.611, 6.13, 1], ['Cologne', 50.938, 6.96, 1], ['Frankfurt', 50.11, 8.682, 1], ['Stuttgart', 48.776, 9.183, 1],
  ['Munich', 48.137, 11.576, 1], ['Zurich', 47.377, 8.542, 1], ['Bern', 46.948, 7.447, 1], ['Geneva', 46.204, 6.143, 1],
  ['Lyon', 45.764, 4.836, 1], ['Milan', 45.464, 9.19, 1], ['Turin', 45.07, 7.687, 1], ['Venice', 45.44, 12.316, 1],
  ['Vienna', 48.208, 16.373, 1], ['Prague', 50.075, 14.438, 1], ['Ljubljana', 46.056, 14.506, 1], ['Zagreb', 45.815, 15.982, 1],
  ['Salzburg', 47.809, 13.055, 1], ['Innsbruck', 47.269, 11.404, 1], ['Strasbourg', 48.573, 7.752, 1], ['Marseille', 43.296, 5.37, 1],
  ['Genoa', 44.405, 8.946, 1], ['Bologna', 44.494, 11.342, 1], ['Florence', 43.77, 11.256, 1], ['Budapest', 47.498, 19.04, 1],
  ['Nuremberg', 49.452, 11.077, 1], ['Lille', 50.629, 3.057, 1], ['Graz', 47.071, 15.44, 1], ['Trieste', 45.65, 13.777, 1],
  ['Southampton', 50.91, -1.404, 2], ['Portsmouth', 50.816, -1.087, 2], ['Dover', 51.128, 1.313, 2], ['Calais', 50.951, 1.858, 2],
  ['Caen', 49.183, -0.371, 2], ['Rouen', 49.443, 1.1, 2], ['Bruges', 51.209, 3.225, 2], ['Ghent', 51.054, 3.717, 2],
  ['Antwerp', 51.219, 4.402, 2], ['Rotterdam', 51.924, 4.478, 2], ['Liège', 50.633, 5.567, 2], ['Aachen', 50.776, 6.084, 2],
  ['Düsseldorf', 51.227, 6.774, 2], ['Koblenz', 50.356, 7.594, 2], ['Mainz', 49.993, 8.247, 2], ['Mannheim', 49.489, 8.467, 2],
  ['Heidelberg', 49.398, 8.673, 2], ['Karlsruhe', 49.007, 8.404, 2], ['Würzburg', 49.791, 9.953, 2], ['Ulm', 48.402, 9.988, 2],
  ['Augsburg', 48.371, 10.898, 2], ['Regensburg', 49.013, 12.102, 2], ['Linz', 48.306, 14.286, 2], ['Reims', 49.258, 4.032, 2],
  ['Metz', 49.12, 6.176, 2], ['Nancy', 48.692, 6.184, 2], ['Dijon', 47.322, 5.041, 2], ['Basel', 47.56, 7.589, 2],
  ['Freiburg', 47.999, 7.842, 2], ['Lucerne', 47.05, 8.309, 2], ['Lausanne', 46.52, 6.633, 2], ['Chur', 46.851, 9.532, 2],
  ['Vaduz', 47.141, 9.521, 2], ['Bregenz', 47.505, 9.749, 2], ['Kempten', 47.726, 10.314, 2], ['Grenoble', 45.188, 5.724, 2],
  ['Annecy', 45.899, 6.129, 2], ['Chamonix', 45.924, 6.869, 2], ['Aosta', 45.737, 7.315, 2], ['Como', 45.808, 9.085, 2],
  ['Bergamo', 45.698, 9.677, 2], ['Brescia', 45.541, 10.211, 2], ['Verona', 45.438, 10.992, 2], ['Padua', 45.406, 11.877, 2],
  ['Trento', 46.07, 11.121, 2], ['Bolzano', 46.498, 11.355, 2], ['Merano', 46.671, 11.153, 2], ['St Moritz', 46.498, 9.839, 2],
  ['Cortina', 46.54, 12.136, 2], ['Udine', 46.071, 13.235, 2], ['Villach', 46.61, 13.85, 2], ['Klagenfurt', 46.624, 14.308, 2],
  ['Maribor', 46.554, 15.646, 2], ['Zell am See', 47.324, 12.796, 2], ['Kitzbühel', 47.446, 12.392, 2], ['Garmisch', 47.492, 11.096, 2],
  ['Füssen', 47.57, 10.7, 2], ['Colmar', 48.079, 7.359, 2], ['Épernay', 49.04, 3.96, 2], ['Beaune', 47.026, 4.84, 2],
]

const PEAKS: [string, number, number, number][] = [
  ['Mont Blanc', 45.8326, 6.8652, 4808], ['Monte Rosa', 45.9369, 7.8668, 4634], ['Matterhorn', 45.9763, 7.6586, 4478],
  ['Jungfrau', 46.5368, 7.9626, 4158], ['Gran Paradiso', 45.5173, 7.2669, 4061], ['Piz Bernina', 46.3823, 9.9082, 4049],
  ['Eiger', 46.5776, 8.0053, 3967], ['Ortler', 46.5086, 10.5447, 3905], ['Monte Viso', 44.6674, 7.0901, 3841],
  ['Grossglockner', 47.0742, 12.6947, 3798], ['Wildspitze', 46.8853, 10.8672, 3768], ['Marmolada', 46.4344, 11.8508, 3343],
  ['Piz Buin', 46.8442, 10.1189, 3312], ['Titlis', 46.7722, 8.4375, 3238], ['Tre Cime', 46.6187, 12.3025, 2999],
  ['Dachstein', 47.475, 13.6061, 2995], ['Zugspitze', 47.4211, 10.9853, 2962], ['Hochkönig', 47.4203, 13.0617, 2941],
  ['Triglav', 46.3783, 13.8367, 2864], ['Watzmann', 47.5547, 12.9214, 2713], ['Säntis', 47.2494, 9.3433, 2502],
  ['Pilatus', 46.9788, 8.2544, 2128], ['Mont Ventoux', 44.174, 5.2789, 1909], ['Feldberg', 47.874, 8.004, 1493],
]

export function Gazetteer() {
  return (
    <>
      {CITIES.map(([name, lat, lon, tier]) => (
        <Anchor key={name} id={`city-${name}`} lon={lon} lat={lat} lift={30} maxDist={tier === 1 ? 900 : 320} priority={tier === 1 ? 1 : 0.5}>
          <span className={`city city--${tier}`}>
            <i aria-hidden="true" />
            <span className="pin__label">{name}</span>
          </span>
        </Anchor>
      ))}
      {PEAKS.map(([name, lat, lon, m]) => (
        <Anchor key={name} id={`peak-${name}`} lon={lon} lat={lat} lift={60} maxDist={m > 3500 ? 420 : 220} priority={0.8}>
          <span className="peak">
            <span className="pin__label">
              ▲ {name} <small>{m.toLocaleString('en-GB')} m</small>
            </span>
          </span>
        </Anchor>
      ))}
    </>
  )
}

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
