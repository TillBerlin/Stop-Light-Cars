import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStatisticsSeries, GRAPH_DURATION_SECONDS, GRAPH_RUNS, simulateStatisticsRun } from './statistics.js';

const defaults = { greenPhase: 20, arrivalRate: 10, stripeCompliance: 100, stripeLength: 50 };

test('statistics use ten five-minute runs and produce both lane values', () => {
  assert.equal(GRAPH_RUNS, 10);
  assert.equal(GRAPH_DURATION_SECONDS, 300);
  const series = buildStatisticsSeries('greenPhase', 'throughput', defaults);
  assert.equal(series.length, 26);
  assert.deepEqual(series[0].lanes.length, 2);
  assert.ok(series.every(point => point.lanes.every(Number.isFinite)));
});

test('waiting time is measured for each lane from spawn until crossing', () => {
  const result = simulateStatisticsRun(defaults, 42);
  assert.ok(result.throughput.every(value => value > 0));
  assert.ok(result.waitingTime.every(value => value >= 0));
});
