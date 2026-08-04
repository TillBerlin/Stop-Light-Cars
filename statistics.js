export const GRAPH_RUNS = 10;
export const GRAPH_DURATION_SECONDS = 5 * 60;

export const graphAxes = {
  greenPhase: { label: 'Green light duration', min: 5, max: 30, step: 1, unit: 's' },
  stripeCompliance: { label: 'Compliance', min: 0, max: 100, step: 10, unit: '%' },
  stripeLength: { label: 'Striped zone length', min: 10, max: 100, step: 10, unit: 'm' },
  arrivalRate: { label: 'Arrival rate', min: 0, max: 20, step: 2, unit: 'cars/min' },
};

export const graphMetrics = {
  throughput: { label: 'Cars travelled through in total', unit: 'cars' },
  waitingTime: { label: 'Average waiting time', unit: 's' },
};

export function buildStatisticsSeries(axisKey, metricKey, fixedParameters, simulateRun) {
  if (typeof simulateRun !== 'function') throw new TypeError('An exact simulation runner is required');
  const axis = graphAxes[axisKey];
  const pointCount = Math.round((axis.max - axis.min) / axis.step) + 1;
  return Array.from({ length: pointCount }, (_, pointIndex) => {
    const x = axis.min + pointIndex * axis.step;
    const sums = [0, 0];
    for (let run = 0; run < GRAPH_RUNS; run++) {
      // Common random numbers keep adjacent parameter points comparable.
      const result = simulateRun({ ...fixedParameters, [axisKey]: x }, 0x9e3779b9 ^ (run * 7919));
      sums[0] += result[metricKey][0];
      sums[1] += result[metricKey][1];
    }
    return { x, lanes: sums.map(value => value / GRAPH_RUNS) };
  });
}
