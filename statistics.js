export const GRAPH_RUNS = 3;
export const GRAPH_DURATION_SECONDS = 2 * 60;
export const GRAPH_RUN_OPTIONS = [3, 5, 10];
export const GRAPH_DURATION_OPTIONS = [3, 5, 10].map(minutes => minutes * 60);

export const graphAxes = {
  // Stepped in fives: below about ten seconds a cycle discharges so few cars that
  // integer quantisation dominates the result, and a one-second step would make the
  // batch graph forty-one points long for no extra insight.
  greenPhase: { label: 'Green light duration', min: 10, max: 50, step: 5, unit: 's' },
  stripeCompliance: { label: 'Compliance', min: 0, max: 100, step: 10, unit: '%' },
  stripeLength: { label: 'Striped zone length', min: 10, max: 100, step: 10, unit: 'm' },
  bottomGap: { label: 'Lane B intended distance', min: 4, max: 8, step: .5, unit: 'm' },
  arrivalRate: { label: 'Arrival rate', min: 0, max: 20, step: 2, unit: 'cars/min' },
  speedLimit: { label: 'Speed limit', min: 20, max: 100, step: 10, unit: 'km/h' },
  aggressiveness: { label: 'Driver aggressiveness', min: 1, max: 5, step: 1, unit: '' },
};

export const graphMetrics = {
  throughput: { label: 'Cars travelled through in total', unit: 'cars' },
  waitingTime: { label: 'Average waiting time', unit: 's' },
};

export function graphScale(maximumValue, targetTickCount = 6) {
  const safeMaximum = Math.max(5, maximumValue);
  const roughStep = safeMaximum / targetTickCount;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = multiplier * magnitude;
  const maximum = Math.max(step, Math.ceil(safeMaximum / step) * step);
  return {
    maximum,
    ticks: Array.from({ length: Math.round(maximum / step) + 1 }, (_, index) => index * step),
  };
}

export function buildStatisticsSeries(axisKey, metricKey, fixedParameters, simulateRun, options = {}) {
  if (typeof simulateRun !== 'function') throw new TypeError('An exact simulation runner is required');
  const runs = options.runs ?? GRAPH_RUNS;
  const duration = options.duration ?? GRAPH_DURATION_SECONDS;
  if (!Number.isInteger(runs) || runs < 1) throw new RangeError('Statistics runs must be a positive integer');
  if (!Number.isFinite(duration) || duration <= 0) throw new RangeError('Statistics duration must be positive');
  const axis = graphAxes[axisKey];
  const pointCount = Math.round((axis.max - axis.min) / axis.step) + 1;
  return Array.from({ length: pointCount }, (_, pointIndex) => {
    const x = axis.min + pointIndex * axis.step;
    const sums = [0, 0];
    for (let run = 0; run < runs; run++) {
      // Common random numbers keep adjacent parameter points comparable.
      const parameters = axisKey === 'aggressiveness'
        ? { ...fixedParameters, aggressiveness: x, aggressivenessMin: x, aggressivenessMax: x }
        : { ...fixedParameters, [axisKey]: x };
      const result = simulateRun(parameters, 0x9e3779b9 ^ (run * 7919), duration);
      sums[0] += result[metricKey][0];
      sums[1] += result[metricKey][1];
    }
    const lanes = sums.map(value => value / runs);
    return { x, lanes, relativeAdvantage: lanes[0] === 0 ? null : lanes[1] / lanes[0] };
  });
}
