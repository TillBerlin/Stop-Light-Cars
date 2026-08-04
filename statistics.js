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

function randomGenerator(seed) {
  let value = seed >>> 0;
  return () => ((value = (1664525 * value + 1013904223) >>> 0) / 2 ** 32);
}

export function simulateStatisticsRun(parameters, seed = 1) {
  // Pair demand and service-time noise so lane differences come from the
  // striped-zone treatment rather than unrelated random traffic samples.
  const arrivalRandom = randomGenerator(seed);
  const serviceRandom = [randomGenerator(seed ^ 0x85ebca6b), randomGenerator(seed ^ 0x85ebca6b)];
  const lanes = [[], []];
  const crossed = [0, 0];
  const totalWait = [0, 0];
  const nextCrossing = [0, 0];
  for (const lane of lanes) for (let index = 0; index < 10; index++) lane.push(0);

  for (let second = 0; second < GRAPH_DURATION_SECONDS; second++) {
    if (arrivalRandom() < parameters.arrivalRate / 60) {
      const spawnedAt = second + arrivalRandom();
      for (const lane of lanes) lane.push(spawnedAt);
    }
    const cycle = parameters.greenPhase + 1 + parameters.greenPhase + 3;
    const phaseTime = second < 1 ? -1 : (second - 1) % cycle;
    if (phaseTime < 0 || phaseTime >= parameters.greenPhase) continue;
    for (let laneIndex = 0; laneIndex < 2; laneIndex++) {
      if (!lanes[laneIndex].length || second < nextCrossing[laneIndex]) continue;
      const spawnedAt = lanes[laneIndex].shift();
      crossed[laneIndex]++;
      totalWait[laneIndex] += Math.max(0, second - spawnedAt);
      const stripeInfluence = Math.min(1, parameters.stripeLength / 100) * parameters.stripeCompliance / 100;
      const normalHeadway = 1.75 + serviceRandom[laneIndex]() * .45;
      // Extra standing room lets part of Lane B's queue start together. The
      // old model added a delay here, reversing the interactive simulation.
      const headwayMultiplier = laneIndex === 1 ? 1 - stripeInfluence * .35 : 1;
      nextCrossing[laneIndex] = second + normalHeadway * headwayMultiplier;
    }
  }
  return { throughput: crossed, waitingTime: crossed.map((count, lane) => count ? totalWait[lane] / count : 0) };
}

export function buildStatisticsSeries(axisKey, metricKey, fixedParameters) {
  const axis = graphAxes[axisKey];
  const pointCount = Math.round((axis.max - axis.min) / axis.step) + 1;
  return Array.from({ length: pointCount }, (_, pointIndex) => {
    const x = axis.min + pointIndex * axis.step;
    const sums = [0, 0];
    for (let run = 0; run < GRAPH_RUNS; run++) {
      // Common random numbers keep adjacent parameter points comparable.
      const result = simulateStatisticsRun({ ...fixedParameters, [axisKey]: x }, 0x9e3779b9 ^ (run * 7919));
      sums[0] += result[metricKey][0];
      sums[1] += result[metricKey][1];
    }
    return { x, lanes: sums.map(value => value / GRAPH_RUNS) };
  });
}
