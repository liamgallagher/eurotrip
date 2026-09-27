import type { Place } from './types'

// Overnight stops, swap options and fixed points.
// Evening scores are editorial (0–10) and meant to be argued with — they feed the "evenings" priority.

const P = (p: Place) => p

export const FIXED = {
  home: P({ id: 'southampton', name: 'Southampton', country: 'GB', lat: 50.9097, lon: -1.4044, evening: 0, blurb: 'Home.', highlights: [] }),
  folkestone: P({ id: 'folkestone', name: 'Folkestone (Eurotunnel)', country: 'GB', lat: 51.0955, lon: 1.1335, evening: 0, blurb: 'Le Shuttle terminal, Cheriton.', highlights: [] }),
  calais: P({ id: 'calais', name: 'Calais (Coquelles)', country: 'FR', lat: 50.9315, lon: 1.8137, evening: 0, blurb: 'Le Shuttle terminal, Coquelles.', highlights: [] }),
  portsmouth: P({ id: 'portsmouth', name: 'Portsmouth ferry port', country: 'GB', lat: 50.8127, lon: -1.0907, evening: 0, blurb: 'Portsmouth International Port.', highlights: [] }),
  caen: P({ id: 'caen', name: 'Caen (Ouistreham)', country: 'FR', lat: 49.2839, lon: -0.2489, evening: 0, blurb: 'Brittany Ferries terminal, Ouistreham.', highlights: [] }),
  // Where exactly in Slovenia is still open, so this point (central Ljubljana) is only used to measure the drive in and out.
  ljubljana: P({ id: 'ljubljana', name: 'Slovenia', country: 'SI', lat: 46.0511, lon: 14.5051, evening: 9, blurb: 'Four nights in Slovenia: plans still to be decided.', highlights: [] }),
} satisfies Record<string, Place>

const list: Place[] = [
  // Route 1
  { id: 'maastricht', name: 'Maastricht', country: 'NL', lat: 50.8514, lon: 5.6910, evening: 9, blurb: 'Burgundian Dutch city of squares, bookshops in churches and great food.', highlights: ['maastricht'] },
  { id: 'aachen', name: 'Aachen', country: 'DE', lat: 50.7753, lon: 6.0839, evening: 7, blurb: "Charlemagne's capital with a UNESCO cathedral and thermal springs.", highlights: ['aachen-cathedral'], notes: ['Aachen has an Umweltzone — green sticker required.'] },
  { id: 'cologne', name: 'Cologne', country: 'DE', lat: 50.9375, lon: 6.9603, evening: 8, blurb: 'Big-city buzz on the Rhine, Kölsch brewhouses in the shadow of the Dom.', highlights: ['cologne-cathedral'], notes: ['Cologne Umweltzone — green sticker required.'] },
  { id: 'heidelberg', name: 'Heidelberg', country: 'DE', lat: 49.4093, lon: 8.6937, evening: 9, blurb: 'Romantic university town under a red sandstone castle on the Neckar.', highlights: ['heidelberg-castle'], notes: ['Heidelberg Umweltzone — green sticker required.'] },
  { id: 'rothenburg', name: 'Rothenburg ob der Tauber', country: 'DE', lat: 49.3772, lon: 10.1789, evening: 9, blurb: 'Near-perfect walled medieval town; magical once the day-trippers leave.', highlights: ['rothenburg'], notes: ['Old town has restricted car access — park outside the walls unless your hotel issues a permit.'] },
  { id: 'dinkelsbuhl', name: 'Dinkelsbühl', country: 'DE', lat: 49.0700, lon: 10.3190, evening: 8, blurb: 'Quieter walled Romantic Road town, arguably prettier than Rothenburg.', highlights: ['dinkelsbuhl'] },
  { id: 'wurzburg', name: 'Würzburg', country: 'DE', lat: 49.7913, lon: 9.9534, evening: 8, blurb: 'Baroque Residenz, Franconian wine taverns and a bridge made for sundowners.', highlights: ['wurzburg-residenz'] },
  { id: 'fussen', name: 'Füssen / Schwangau', country: 'DE', lat: 47.5696, lon: 10.7004, evening: 6, blurb: 'Small Allgäu town at the foot of Neuschwanstein and the Alps.', highlights: ['neuschwanstein'] },
  { id: 'munich', name: 'Munich', country: 'DE', lat: 48.1374, lon: 11.5755, evening: 9, blurb: 'Beer gardens, galleries and the best big-city evening in southern Germany.', highlights: ['munich'], notes: ['Munich Umweltzone — green sticker required.'] },
  { id: 'garmisch', name: 'Garmisch-Partenkirchen', country: 'DE', lat: 47.4921, lon: 11.0958, evening: 6, blurb: 'Painted Alpine town under the Zugspitze.', highlights: ['partnachklamm'] },
  { id: 'zell-am-see', name: 'Zell am See', country: 'AT', lat: 47.3238, lon: 12.7960, evening: 7, blurb: 'Lakeside resort facing the Hohe Tauern — the launch pad for the Grossglockner.', highlights: ['zell-am-see-lake'], charging: 'No Supercharger in Zell/Kaprun: book a hotel with destination charging (you arrive with plenty from Salzburg or Kufstein).' },
  { id: 'kitzbuhel', name: 'Kitzbühel', country: 'AT', lat: 47.4460, lon: 12.3920, evening: 7, blurb: 'Chic Tyrolean ski town with a painted medieval centre.', highlights: ['kitzbuhel'] },
  { id: 'kaprun', name: 'Kaprun', country: 'AT', lat: 47.2720, lon: 12.7590, evening: 5, blurb: 'Quiet village 10 minutes from Zell, at the mouth of the high reservoirs valley.', highlights: ['kaprun-reservoirs'] },

  // Route 2
  { id: 'reims', name: 'Reims', country: 'FR', lat: 49.2583, lon: 4.0317, evening: 8, blurb: 'Coronation cathedral above, miles of champagne cellars below.', highlights: ['reims-cathedral', 'champagne-cellars'], notes: ['Reims has a ZFE — Crit\'Air 0 (green) sticker needed.'] },
  { id: 'epernay', name: 'Épernay', country: 'FR', lat: 49.0400, lon: 3.9600, evening: 7, blurb: 'Smaller champagne capital on the Avenue de Champagne.', highlights: ['avenue-de-champagne'] },
  { id: 'colmar', name: 'Colmar', country: 'FR', lat: 48.0794, lon: 7.3585, evening: 9, blurb: 'Half-timbered canals and flower boxes at the heart of the Alsace Wine Route.', highlights: ['colmar'], notes: ['Colmar has a ZFE — Crit\'Air sticker needed.'] },
  { id: 'riquewihr', name: 'Riquewihr', country: 'FR', lat: 48.1668, lon: 7.2972, evening: 7, blurb: 'Tiny walled wine village — gorgeous and very quiet at night.', highlights: ['riquewihr'] },
  { id: 'strasbourg', name: 'Strasbourg', country: 'FR', lat: 48.5734, lon: 7.7521, evening: 9, blurb: 'Gothic cathedral, Petite France canals and winstubs.', highlights: ['strasbourg'], notes: ['Strasbourg ZFE — Crit\'Air sticker needed.'] },
  { id: 'lucerne', name: 'Lucerne', country: 'CH', lat: 47.0502, lon: 8.3093, evening: 9, blurb: 'Covered bridges, lake steamers and mountains at the end of every street.', highlights: ['lucerne', 'pilatus'] },
  { id: 'zurich', name: 'Zurich', country: 'CH', lat: 47.3769, lon: 8.5417, evening: 8, blurb: 'Lakeside old town and a lively (pricey) evening scene.', highlights: ['zurich'] },
  { id: 'varenna', name: 'Varenna (Lake Como)', country: 'IT', lat: 46.0106, lon: 9.2836, evening: 8, blurb: 'Pastel village on the eastern shore, lakeside passeggiata at dusk.', highlights: ['varenna'], notes: ['Tiny village with very limited parking — choose a hotel with parking.'] },
  { id: 'bellagio', name: 'Bellagio', country: 'IT', lat: 45.9870, lon: 9.2610, evening: 8, blurb: 'The "pearl of the lake" at the fork of Lake Como.', highlights: ['bellagio'], notes: ['Reached by a slow narrow shore road or car ferry from Varenna.'] },
  { id: 'como', name: 'Como', country: 'IT', lat: 45.8081, lon: 9.0852, evening: 8, blurb: 'Elegant lake city with a funicular to Brunate.', highlights: ['como'], notes: ['Como has a ZTL in the walled centre.'] },
  { id: 'milan', name: 'Milan', country: 'IT', lat: 45.4642, lon: 9.1900, evening: 9, blurb: 'Duomo rooftops, aperitivo and serious food.', highlights: ['milan'], notes: ['Area C congestion charge and ZTLs — use a hotel garage and walk/metro.'] },
  { id: 'venice', name: 'Venice (park at Tronchetto)', country: 'IT', lat: 45.4400, lon: 12.3050, evening: 10, blurb: 'Sleep in the lagoon city itself; car stays in a mainland/Tronchetto garage.', highlights: ['venice'], notes: ['Park on the mainland or at Tronchetto/Piazzale Roma — no cars in Venice.', 'Check whether the access fee applies on your dates (overnight guests are exempt but may need to register).'] },
  { id: 'verona', name: 'Verona', country: 'IT', lat: 45.4384, lon: 10.9916, evening: 9, blurb: 'Roman arena, balconies and wine bars — easy to drive to, unlike Venice.', highlights: ['verona'], notes: ['Verona ZTL covers the centre — hotel must register your plate.'] },
  { id: 'padua', name: 'Padua', country: 'IT', lat: 45.4064, lon: 11.8768, evening: 8, blurb: 'University city with Giotto frescoes; 30 min train to Venice.', highlights: ['padua'] },
  { id: 'treviso', name: 'Treviso', country: 'IT', lat: 45.6669, lon: 12.2430, evening: 7, blurb: 'Canal town, home of tiramisù, 30 min from Venice.', highlights: ['treviso'] },

  // Route 3
  { id: 'ypres', name: 'Ypres (Ieper)', country: 'BE', lat: 50.8514, lon: 2.8850, evening: 7, blurb: 'Rebuilt Flemish town; the Last Post at the Menin Gate every evening at 8pm.', highlights: ['menin-gate'] },
  { id: 'lille', name: 'Lille', country: 'FR', lat: 50.6292, lon: 3.0573, evening: 8, blurb: 'Flemish-French old town with great estaminets.', highlights: ['lille'] },
  { id: 'baden-baden', name: 'Baden-Baden', country: 'DE', lat: 48.7606, lon: 8.2398, evening: 7, blurb: 'Belle-époque spa town at the start of the Black Forest High Road.', highlights: ['baden-baden'] },
  { id: 'triberg', name: 'Triberg', country: 'DE', lat: 48.1310, lon: 8.2330, evening: 4, blurb: 'Cuckoo-clock town by Germany\'s famous waterfalls — sleepy in the evening.', highlights: ['triberg-falls'] },
  { id: 'freiburg', name: 'Freiburg im Breisgau', country: 'DE', lat: 47.9990, lon: 7.8421, evening: 8, blurb: 'Sunny university town with a lively old centre.', highlights: ['freiburg'] },
  { id: 'titisee', name: 'Titisee', country: 'DE', lat: 47.9036, lon: 8.1552, evening: 5, blurb: 'Black Forest lake resort.', highlights: ['titisee'] },
  { id: 'innsbruck', name: 'Innsbruck', country: 'AT', lat: 47.2692, lon: 11.4041, evening: 8, blurb: 'Golden Roof old town with a 2,000 m cable car straight from the centre.', highlights: ['innsbruck'] },
  { id: 'st-anton', name: 'St Anton am Arlberg', country: 'AT', lat: 47.1296, lon: 10.2682, evening: 6, blurb: 'Famous ski resort — quiet in May, many hotels shut between seasons.', highlights: ['st-anton'], notes: ['Between-season: many hotels close from late April to June.'] },
  { id: 'hall-in-tirol', name: 'Hall in Tirol', country: 'AT', lat: 47.2833, lon: 11.5080, evening: 7, blurb: 'Largest intact old town in Tyrol, 10 minutes from Innsbruck.', highlights: ['hall-in-tirol'] },
  { id: 'cortina', name: "Cortina d'Ampezzo", country: 'IT', lat: 46.5405, lon: 12.1357, evening: 7, blurb: 'Queen of the Dolomites, ringed by Tofane, Cristallo and Cinque Torri.', highlights: ['cortina'], notes: ['Many Dolomites hotels close between ski season and summer (often mid-April to late May or June) — book early and confirm.'], charging: 'Nearest Supercharger: Borca di Cadore, ~15 km.' },
  { id: 'ortisei', name: 'Ortisei (Val Gardena)', country: 'IT', lat: 46.5747, lon: 11.6717, evening: 7, blurb: 'Woodcarvers\' village under the Seceda and Sassolungo.', highlights: ['val-gardena'], notes: ['Between-season closures common in May.'] },
  { id: 'arabba', name: 'Arabba', country: 'IT', lat: 46.4970, lon: 11.8750, evening: 5, blurb: 'Tiny village between Pordoi and Campolongo passes.', highlights: ['arabba'], notes: ['Very limited in May — many places closed.'] },
  { id: 'san-candido', name: 'San Candido / Innichen', country: 'IT', lat: 46.7330, lon: 12.2810, evening: 6, blurb: 'Pretty Puster Valley market town near the Tre Cime.', highlights: ['san-candido'] },

  // Route 4 / 6 / 7
  { id: 'bruges', name: 'Bruges', country: 'BE', lat: 51.2093, lon: 3.2247, evening: 9, blurb: 'Canals, belfry and beer — at its best after the day crowds go.', highlights: ['bruges'], notes: ['Park at the station car park (Centrum-Station); centre has restricted access.'] },
  { id: 'ghent', name: 'Ghent', country: 'BE', lat: 51.0543, lon: 3.7174, evening: 9, blurb: 'Grittier, livelier Bruges with the Ghent Altarpiece.', highlights: ['ghent'], notes: ['Ghent has a LEZ and car-free centre loop — register foreign car (EVs compliant).'] },
  { id: 'bacharach', name: 'Bacharach', country: 'DE', lat: 50.0580, lon: 7.7690, evening: 7, blurb: 'Half-timbered wine village inside the UNESCO Rhine Gorge.', highlights: ['bacharach'] },
  { id: 'cochem', name: 'Cochem', country: 'DE', lat: 50.1470, lon: 7.1670, evening: 7, blurb: 'Moselle town under a fairy-tale castle.', highlights: ['cochem'] },
  { id: 'boppard', name: 'Boppard', country: 'DE', lat: 50.2310, lon: 7.5900, evening: 6, blurb: 'Riverside Rhine town with a chairlift to the Vierseenblick.', highlights: ['boppard'] },
  { id: 'rudesheim', name: 'Rüdesheim am Rhein', country: 'DE', lat: 49.9790, lon: 7.9240, evening: 7, blurb: 'Wine-tavern lanes and a cable car over the vineyards.', highlights: ['rudesheim'] },
  { id: 'regensburg', name: 'Regensburg', country: 'DE', lat: 49.0134, lon: 12.1016, evening: 9, blurb: 'Intact medieval city on the Danube with the oldest sausage kitchen in Germany.', highlights: ['regensburg'] },
  { id: 'bamberg', name: 'Bamberg', country: 'DE', lat: 49.8988, lon: 10.9028, evening: 9, blurb: 'UNESCO old town and smoked-beer taverns.', highlights: ['bamberg'] },
  { id: 'nuremberg', name: 'Nuremberg', country: 'DE', lat: 49.4521, lon: 11.0767, evening: 8, blurb: 'Imperial castle, bratwurst and a sobering 20th-century history.', highlights: ['nuremberg'], notes: ['Nuremberg Umweltzone — green sticker required.'] },
  { id: 'salzburg', name: 'Salzburg', country: 'AT', lat: 47.8095, lon: 13.0550, evening: 9, blurb: 'Baroque domes, fortress views and Mozart.', highlights: ['salzburg'] },
  { id: 'berchtesgaden', name: 'Berchtesgaden', country: 'DE', lat: 47.6323, lon: 13.0021, evening: 6, blurb: 'Alpine market town by the Königssee and Rossfeld road.', highlights: ['konigssee'] },
  { id: 'hallstatt', name: 'Hallstatt', country: 'AT', lat: 47.5622, lon: 13.6493, evening: 7, blurb: 'The postcard lake village — serene once the coaches leave.', highlights: ['hallstatt'], notes: ['Hotel guests can drive in; day visitors use the paid car parks. Book a hotel with parking.'], charging: 'No Supercharger nearby (Liezen ~50 km): rely on hotel charging.' },
  { id: 'st-wolfgang', name: 'St Wolfgang im Salzkammergut', country: 'AT', lat: 47.7390, lon: 13.4470, evening: 7, blurb: 'Lakeside pilgrimage village on the Wolfgangsee.', highlights: ['wolfgangsee'] },
  { id: 'bad-ischl', name: 'Bad Ischl', country: 'AT', lat: 47.7115, lon: 13.6239, evening: 6, blurb: 'Imperial spa town with Zauner cake.', highlights: ['bad-ischl'] },

  // Route 5
  { id: 'beaune', name: 'Beaune', country: 'FR', lat: 47.0260, lon: 4.8400, evening: 9, blurb: 'Burgundy wine capital — glazed-tile Hospices and tasting cellars.', highlights: ['hospices-de-beaune'] },
  { id: 'dijon', name: 'Dijon', country: 'FR', lat: 47.3220, lon: 5.0415, evening: 8, blurb: 'Ducal city, owl trail and gastronomy.', highlights: ['dijon'] },
  { id: 'annecy', name: 'Annecy', country: 'FR', lat: 45.8992, lon: 6.1294, evening: 9, blurb: 'Canals and a turquoise lake ringed by mountains.', highlights: ['annecy'] },
  { id: 'talloires', name: 'Talloires', country: 'FR', lat: 45.8410, lon: 6.2130, evening: 6, blurb: 'Quiet lakeshore village opposite Annecy.', highlights: ['talloires'] },
  { id: 'chamonix', name: 'Chamonix', country: 'FR', lat: 45.9237, lon: 6.8694, evening: 8, blurb: 'Mountaineering capital under Mont Blanc.', highlights: ['aiguille-du-midi', 'chamonix'], charging: 'No Supercharger in the valley: hotel charging, or Sallanches/Archamps en route.' },
  { id: 'megeve', name: 'Megève', country: 'FR', lat: 45.8567, lon: 6.6175, evening: 7, blurb: 'Chalet-chic village with Mont Blanc views.', highlights: ['megeve'] },
  { id: 'courmayeur', name: 'Courmayeur', country: 'IT', lat: 45.7917, lon: 6.9725, evening: 7, blurb: 'Italian side of Mont Blanc; Skyway cable car.', highlights: ['skyway-monte-bianco'] },
  { id: 'aosta', name: 'Aosta', country: 'IT', lat: 45.7370, lon: 7.3150, evening: 7, blurb: '"Rome of the Alps" — Roman gate, theatre and fontina.', highlights: ['aosta'], notes: ['Aosta has a ZTL in the historic centre.'] },
  { id: 'cogne', name: 'Cogne', country: 'IT', lat: 45.6080, lon: 7.3560, evening: 5, blurb: 'Gateway to Gran Paradiso National Park.', highlights: ['gran-paradiso'] },
  { id: 'valdobbiadene', name: 'Valdobbiadene', country: 'IT', lat: 45.9000, lon: 12.0330, evening: 6, blurb: 'Prosecco Superiore village — agriturismi among steep vine hills.', highlights: ['cartizze'] },
  { id: 'conegliano', name: 'Conegliano', country: 'IT', lat: 45.8870, lon: 12.2970, evening: 6, blurb: 'Castle town at the eastern end of the Prosecco road.', highlights: ['conegliano'] },
  { id: 'bassano', name: 'Bassano del Grappa', country: 'IT', lat: 45.7670, lon: 11.7340, evening: 7, blurb: 'Palladio\'s wooden bridge and grappa distilleries.', highlights: ['bassano'] },

  // Route 6
  { id: 'prague', name: 'Prague', country: 'CZ', lat: 50.0755, lon: 14.4378, evening: 10, blurb: 'Castle, bridge and beer halls — one of Europe\'s great evenings.', highlights: ['prague'], notes: ['Old Town parking is restricted (blue/orange zones) — use a hotel garage or P+R.'] },
  { id: 'cesky-krumlov', name: 'Český Krumlov', country: 'CZ', lat: 48.8127, lon: 14.3175, evening: 9, blurb: 'Fairy-tale river-loop town with a vast castle.', highlights: ['cesky-krumlov'] },
  { id: 'vienna', name: 'Vienna', country: 'AT', lat: 48.2082, lon: 16.3738, evening: 10, blurb: 'Cafés, wine taverns and imperial grandeur.', highlights: ['vienna'], notes: ['Short-stay parking zones cover all of Vienna — use a hotel garage.'] },
  { id: 'graz', name: 'Graz', country: 'AT', lat: 47.0707, lon: 15.4395, evening: 8, blurb: 'Relaxed UNESCO old town with a clock tower on a hill.', highlights: ['graz'] },

  // Route 7
  { id: 'chur', name: 'Chur', country: 'CH', lat: 46.8508, lon: 9.5320, evening: 7, blurb: 'Switzerland\'s oldest town — the gateway to the Julier and Engadin.', highlights: ['chur'] },
  { id: 'vaduz', name: 'Vaduz', country: 'LI', lat: 47.1410, lon: 9.5215, evening: 5, blurb: 'Tick off Liechtenstein under its castle.', highlights: ['vaduz'] },
  { id: 'davos', name: 'Davos', country: 'CH', lat: 46.8027, lon: 9.8360, evening: 5, blurb: 'High-altitude town — quiet between seasons.', highlights: ['davos'] },
  { id: 'bolzano', name: 'Bolzano / Bozen', country: 'IT', lat: 46.4983, lon: 11.3548, evening: 8, blurb: 'Arcaded Italian-Tyrolean city, home of Ötzi the Iceman.', highlights: ['bolzano'] },
  { id: 'merano', name: 'Merano', country: 'IT', lat: 46.6713, lon: 11.1525, evening: 8, blurb: 'Spa town of palm trees and promenades.', highlights: ['merano'] },
  { id: 'sappada', name: 'Sappada', country: 'IT', lat: 46.5670, lon: 12.6860, evening: 5, blurb: 'Alpine village of wooden houses near the Piave source.', highlights: ['sappada'] },
]

export const PLACES: Record<string, Place> = Object.fromEntries(
  [...Object.values(FIXED), ...list].map((p) => [p.id, p]),
)
