import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStatisticsSeries, GRAPH_DURATION_SECONDS, GRAPH_RUNS } from './statistics.js';

const defaults = { greenPhase: 20, arrivalRate: 10, stripeCompliance: 100, stripeLength: 50 };

test('statistics use ten five-minute runs and produce both lane values', () => {
  assert.equal(GRAPH_RUNS, 10);
  assert.equal(GRAPH_DURATION_SECONDS, 300);
  const calls = [];
  const series = buildStatisticsSeries('greenPhase', 'throughput', defaults, (parameters, seed) => {
    calls.push({ parameters, seed });
    return { throughput: [parameters.greenPhase, parameters.greenPhase + 1], waitingTime: [1, 2] };
  });
  assert.equal(series.length, 26);
  assert.deepEqual(series[0].lanes.length, 2);
  assert.ok(series.every(point => point.lanes.every(Number.isFinite)));
  assert.equal(calls.length, series.length * GRAPH_RUNS);
});

test('statistics require a simulation runner instead of using a separate approximation', () => {
  assert.throws(() => buildStatisticsSeries('greenPhase', 'throughput', defaults),
    /exact simulation runner/);
});

test('striped-zone compliance improves Lane B without changing Lane A', () => {
  const series = buildStatisticsSeries('stripeCompliance', 'throughput', defaults, parameters => ({
    throughput: [50, 50 + parameters.stripeCompliance / 10], waitingTime: [0, 0],
  }));
  const laneA = series.map(point => point.lanes[0]);
  const laneB = series.map(point => point.lanes[1]);

  assert.ok(laneA.every(value => value === laneA[0]));
  assert.ok(laneB.every((value, index) => index === 0 || value >= laneB[index - 1]));
  assert.equal(laneB[0], laneA[0]);
  assert.ok(laneB.at(-1) > laneA.at(-1));
});
