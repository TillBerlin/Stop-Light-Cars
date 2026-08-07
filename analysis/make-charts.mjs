// Turns a results file into the inline SVG charts embedded in the Findings section.
//
//   node analysis/make-charts.mjs analysis/results/full.json
//
// Each chart draws every scenario as a faint line with the rush-hour reference picked
// out on top, so a reader can see at a glance whether a finding holds generally or only
// around one operating point. Placeholders of the form <!--CHART:key--> in index.html
// are replaced in place.

import fs from 'node:fs';

const source = process.argv[2] ?? 'analysis/results/full.json';
const data = JSON.parse(fs.readFileSync(source, 'utf8'));

const W = 440, H = 200, L = 48, R = 16, T = 14, B = 42;
const REFERENCE = 'rush-hour';

function chartFor(hypothesisKey, { unit = '', xLabel = '', marker = null, exclude = [] } = {}) {
  const series = data.scenarios
    // A scenario whose own settings override the swept axis would draw a flat line that
    // says nothing about the axis, so it is left out of that chart.
    .filter(scenario => !exclude.includes(scenario.key))
    .map(scenario => ({
      key: scenario.key,
      label: scenario.label,
      points: scenario.sweeps[hypothesisKey].filter(point => point.ratio !== null),
    })).filter(entry => entry.points.length > 1);
  if (series.length === 0) return '<!-- no data -->';

  const every = series.flatMap(entry => entry.points);
  const xs = every.map(point => point.x);
  const ratios = every.map(point => point.ratio);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  let lo = Math.min(1, ...ratios), hi = Math.max(...ratios);
  lo = Math.floor(lo * 10) / 10;
  hi = Math.ceil(hi * 10) / 10;
  if (hi - lo < .2) hi = lo + .2;

  const X = value => L + (value - xMin) / (xMax - xMin || 1) * (W - L - R);
  const Y = value => T + (hi - value) / (hi - lo) * (H - T - B);

  const step = (hi - lo) > .6 ? .2 : .1;
  const ticks = [];
  for (let value = lo; value <= hi + 1e-9; value += step) ticks.push(Math.round(value * 100) / 100);

  const reference = series.find(entry => entry.key === REFERENCE) ?? series[0];
  const others = series.filter(entry => entry !== reference);

  const path = points => points.map(point => `${X(point.x).toFixed(1)},${Y(point.ratio).toFixed(1)}`).join(' ');
  const grid = ticks.map(value =>
    `<line class="fc-grid" x1="${L}" y1="${Y(value).toFixed(1)}" x2="${W - R}" y2="${Y(value).toFixed(1)}"/>`
    + `<text class="fc-lab" x="${L - 7}" y="${(Y(value) + 3.5).toFixed(1)}" text-anchor="end">${value.toFixed(1)}</text>`).join('');
  const unity = (lo <= 1 && hi >= 1)
    ? `<line class="fc-unity" x1="${L}" y1="${Y(1).toFixed(1)}" x2="${W - R}" y2="${Y(1).toFixed(1)}"/>` : '';
  const markerLine = marker !== null && marker >= xMin && marker <= xMax
    ? `<line class="fc-marker" x1="${X(marker).toFixed(1)}" y1="${T}" x2="${X(marker).toFixed(1)}" y2="${H - B}"/>` : '';

  const faint = others.map(entry =>
    `<polyline class="fc-other" points="${path(entry.points)}"><title>${entry.label}</title></polyline>`).join('');
  const main = `<polyline class="fc-line" points="${path(reference.points)}"/>`
    + reference.points.map(point =>
      `<circle class="fc-dot" cx="${X(point.x).toFixed(1)}" cy="${Y(point.ratio).toFixed(1)}" r="2.4"/>`).join('');

  const labelPoints = reference.points;
  const stride = Math.max(1, Math.ceil(labelPoints.length / 6));
  const xLabels = labelPoints.filter((_, index) => index % stride === 0 || index === labelPoints.length - 1)
    .map(point => `<text class="fc-lab" x="${X(point.x).toFixed(1)}" y="${H - B + 15}" text-anchor="middle">${point.x}${unit}</text>`).join('');

  const axes = `<line class="fc-axis" x1="${L}" y1="${T}" x2="${L}" y2="${H - B}"/>`
    + `<line class="fc-axis" x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}"/>`;
  const title = `<text class="fc-title" x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle">${xLabel}</text>`;

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Lane B over Lane A throughput ratio against ${xLabel}, one line per scenario">`
    + `${grid}${unity}${markerLine}${axes}${faint}${main}${xLabels}${title}</svg>`;
}

const CHARTS = {
  saturation: { unit: '', xLabel: 'Arrival rate (cars/min) · capacity is about 8-9', marker: 15, exclude: ['peak-and-ebb'] },
  'mix-width': { unit: '', xLabel: 'Spread of driver personalities (0 = identical, 4 = full range)', marker: 2 },
  compliance: { unit: '%', xLabel: 'Compliance (%) · default 70', marker: 70 },
  'zone-length': { unit: 'm', xLabel: 'Striped zone length (m) · default 50', marker: 50 },
  'green-phase': { unit: 's', xLabel: 'Green phase (s) · default 20', marker: 20 },
  'speed-limit': { unit: '', xLabel: 'Speed limit (km/h) · default 50', marker: 50 },
  'driver-style': { unit: '', xLabel: 'Uniform driver level (1 cautious → 5 aggressive)', marker: null },
  'intended-distance': { unit: 'm', xLabel: 'Lane B intended distance (m) · default 6', marker: 6 },
};

let html = fs.readFileSync('index.html', 'utf8');
let injected = 0;
for (const [key, options] of Object.entries(CHARTS)) {
  const token = `<!--CHART:${key}-->`;
  if (!html.includes(token)) { console.error('missing placeholder:', key); continue; }
  html = html.replace(token, chartFor(key, options));
  injected++;
}
fs.writeFileSync('index.html', html);
console.log(`injected ${injected} charts from ${source}`);
