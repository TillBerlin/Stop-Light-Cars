// Reusable parameter-sweep harness. Boots the real simulation engine headlessly and
// runs it across a range of parameter values. Nothing here approximates the model:
// every data point calls runStatisticsSimulation, the same entry point the page's
// batch graph uses, which in turn runs the same 50ms timestep as the visible run.
//
// See README.md in this directory for the measurement pitfalls before interpreting
// anything this produces.

import { installFakeBrowser } from './fake-dom.mjs';

installFakeBrowser();

// The engine reads Math.random at import time while building its initial lanes.
// Seeding here keeps a bare import reproducible; runStatisticsSimulation swaps in its
// own seeded generator per run and restores this afterwards.
let bootState = 0x5eed1234;
Math.random = () => ((bootState = (1664525 * bootState + 1013904223) >>> 0) / 2 ** 32);

const engine = await import('../app.js');
export const { runStatisticsSimulation } = engine;

// The page's own defaults, restated so a sweep is explicit about its starting point
// rather than silently inheriting whatever app.js currently ships.
export const RUSH_HOUR = Object.freeze({
  greenPhase: 20,
  arrivalRate: 15,
  stripeCompliance: 70,
  stripeLength: 50,
  bottomGap: 6,
  speedLimit: 50,
  aggressiveness: 3,
  aggressivenessMin: 2,
  aggressivenessMax: 4,
});

export const DEFAULT_RUNS = 20;
export const DEFAULT_DURATION = 300;

// Most axes are a plain settings key, but two are derived.
//
//   aggressiveness    a uniform population at exactly that level, matching the page's
//                     own aggressiveness axis.
//   driverMixWidth    how wide a spread of personalities the population contains,
//                     centred on normal. Width 0 is every driver identical; width 4
//                     spans very cautious to aggressive. Driver level is continuous
//                     now, so half-level bounds are meaningful.
function buildParameters(axisKey, x, scenario) {
  if (axisKey === 'aggressiveness') {
    return { ...scenario, aggressiveness: x, aggressivenessMin: x, aggressivenessMax: x };
  }
  if (axisKey === 'driverMixWidth') {
    const centre = 3;
    return {
      ...scenario,
      aggressivenessMin: Math.max(1, centre - x / 2),
      aggressivenessMax: Math.min(5, centre + x / 2),
      driverMixShape: 'uniform',
    };
  }
  return { ...scenario, [axisKey]: x };
}

// Common random numbers: every value of the swept axis sees the same sequence of run
// seeds, so adjacent points differ because of the parameter rather than because of
// luck. This mirrors buildStatisticsSeries in statistics.js, but accepts an arbitrary
// list of x values instead of being tied to a slider's min/max/step.
export function sweep(axisKey, values, scenario = RUSH_HOUR, options = {}) {
  const runs = options.runs ?? DEFAULT_RUNS;
  const duration = options.duration ?? DEFAULT_DURATION;
  return values.map(x => {
    const throughput = [0, 0];
    const waiting = [0, 0];
    for (let run = 0; run < runs; run++) {
      const parameters = buildParameters(axisKey, x, scenario);
      const result = runStatisticsSimulation(parameters, 0x9e3779b9 ^ (run * 7919), duration);
      throughput[0] += result.throughput[0];
      throughput[1] += result.throughput[1];
      waiting[0] += result.waitingTime[0];
      waiting[1] += result.waitingTime[1];
    }
    const laneA = throughput[0] / runs;
    const laneB = throughput[1] / runs;
    return {
      x,
      laneA,
      laneB,
      ratio: laneA === 0 ? null : laneB / laneA,
      waitA: waiting[0] / runs,
      waitB: waiting[1] / runs,
      runs,
      duration,
    };
  });
}

// A single point, for measuring a scenario at its own settings rather than across an axis.
export function measure(scenario = RUSH_HOUR, options = {}) {
  const runs = options.runs ?? DEFAULT_RUNS;
  const duration = options.duration ?? DEFAULT_DURATION;
  const throughput = [0, 0];
  const waiting = [0, 0];
  for (let run = 0; run < runs; run++) {
    const result = runStatisticsSimulation(scenario, 0x9e3779b9 ^ (run * 7919), duration);
    throughput[0] += result.throughput[0];
    throughput[1] += result.throughput[1];
    waiting[0] += result.waitingTime[0];
    waiting[1] += result.waitingTime[1];
  }
  const laneA = throughput[0] / runs;
  const laneB = throughput[1] / runs;
  return {
    x: null,
    laneA,
    laneB,
    ratio: laneA === 0 ? null : laneB / laneA,
    waitA: waiting[0] / runs,
    waitB: waiting[1] / runs,
    runs,
    duration,
  };
}

export function formatTable(points, { axisLabel = 'x', unit = '' } = {}) {
  const header = `${axisLabel}${unit ? ` (${unit})` : ''}\tLane A\tLane B\tB/A\tgain\twait A\twait B`;
  const rows = points.map(point => [
    point.x,
    point.laneA.toFixed(1),
    point.laneB.toFixed(1),
    point.ratio === null ? 'n/a' : point.ratio.toFixed(4),
    point.ratio === null ? 'n/a' : `${((point.ratio - 1) * 100).toFixed(1)}%`,
    point.waitA.toFixed(1),
    point.waitB.toFixed(1),
  ].join('\t'));
  return [header, ...rows].join('\n');
}
