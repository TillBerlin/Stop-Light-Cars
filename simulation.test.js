import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeBrowser } from './analysis/fake-dom.mjs';

installFakeBrowser();
let randomState = 0x5eed1234;
Math.random = () => ((randomState = (1664525 * randomState + 1013904223) >>> 0) / 2 ** 32);
const { restartSimulation, roadRenderMetrics, runHeadlessSimulation, runStatisticsSimulation,
  jerkLimitFor, SIMULATION_DURATION_SECONDS } = await import('./app.js');
const { BEHAVIOR, limitAccelerationByJerk } = await import('./driver-behavior.js');
const simulationResult = runHeadlessSimulation(60);

test('waits for a measurable road before calculating vehicle positions', () => {
  assert.equal(roadRenderMetrics(0), null);
  assert.equal(roadRenderMetrics(Number.NaN), null);
  assert.deepEqual(roadRenderMetrics(1000), {
    roadWidth: 1000,
    stopFraction: .82,
    pixelsPerMeter: 1000 * .82 / 110,
  });
});

test('default 60-second simulation keeps safety interventions within its regression budget', () => {
  assert.equal(simulationResult.diagnostics.crashes, 0,
    `observed ${simulationResult.diagnostics.crashes} collision corrections`);
  assert.ok(simulationResult.diagnostics.emergencyBrakes <= 10,
    `observed ${simulationResult.diagnostics.emergencyBrakes} emergency-brake events`);
});

test('emergency braking reaches its requested deceleration within 0.3 seconds', () => {
  const step = .05;
  const requestedAcceleration = -2.5;
  let acceleration = 0;
  let elapsed = 0;

  while (acceleration !== requestedAcceleration && elapsed < .3) {
    acceleration = limitAccelerationByJerk(
      acceleration,
      requestedAcceleration,
      jerkLimitFor(BEHAVIOR.EMERGENCY_BRAKE, requestedAcceleration, acceleration),
      step,
    );
    elapsed += step;
  }

  assert.equal(acceleration, requestedAcceleration);
  assert.ok(elapsed <= .3, `emergency braking took ${elapsed.toFixed(2)} seconds`);
  assert.equal(jerkLimitFor(BEHAVIOR.EMERGENCY_BRAKE, -1, -2), 2,
    'releasing an emergency brake should use ordinary pedal smoothing');
});

test('no car remains stopped for three seconds behind a gap larger than ten metres', () => {
  assert.deepEqual(simulationResult.diagnostics.prolongedOpenGaps, []);
});

test('the first four initial cars in both lanes start during the first green phase', () => {
  for (const lane of [0, 1]) {
    const starts = simulationResult.diagnostics.starts.filter(start => start.lane === lane).slice(0, 4);
    assert.equal(starts.length, 4, `lane ${lane} did not start its first four cars`);
    assert.ok(starts.every(start => start.time <= 13), `lane ${lane} started a car after the first green`);
  }
});

// Losing clearance mid-countdown and returning to WAIT is deliberate behaviour, and
// a mixed driver population triggers it occasionally: a cautious leader can pull away
// too slowly for the follower to keep its clearing distance. These two guards therefore
// pin the homogeneous normal population they were written for, where a car that begins
// its countdown should always be able to finish it.
const uniformNormal = {
  greenPhase: 20, arrivalRate: 10, stripeCompliance: 100, stripeLength: 50, bottomGap: 6,
  speedLimit: 50, aggressiveness: 3, aggressivenessMin: 3, aggressivenessMax: 3,
};

function assertSingleStartupPerCar(diagnostics, context) {
  const startupEntries = diagnostics.behaviorTransitions.filter(transition => transition.to === 'STARTUP');
  const entriesByCar = Map.groupBy(startupEntries, transition => transition.carId);
  for (const [carId, entries] of entriesByCar) {
    assert.equal(entries.length, 1,
      `${context}: car ${carId} entered startup ${entries.length} times: ${JSON.stringify(diagnostics.behaviorTransitions.filter(transition => transition.carId === carId))}`);
  }
}

test('cars do not repeat startup during the first green wave', () => {
  assertSingleStartupPerCar(
    runStatisticsSimulation(uniformNormal, 0x5eed1234, 13).diagnostics,
    'uniform normal population',
  );
});

test('cars do not repeat startup during the first green wave across several seeds', () => {
  for (const seed of [1, 42, 0x5eed1234, 0xdeadbeef, 0xffffffff]) {
    assertSingleStartupPerCar(
      runStatisticsSimulation(uniformNormal, seed, 13).diagnostics,
      `seed ${seed}`,
    );
  }
});

test('cars crossing on red were committed to crossing during orange', () => {
  const redCrossings = simulationResult.diagnostics.lineCrossings.filter(crossing => crossing.phase === 'red');
  assert.ok(redCrossings.every(crossing => crossing.committedDuringOrange),
    `observed an uncommitted red crossing: ${JSON.stringify(redCrossings)}`);
});

test('cars stopping in the striped zone on red leave about six metres', () => {
  const stops = simulationResult.diagnostics.stripedZoneStops;
  const zoneEnd = 50, edgeBand = 2;
  assert.ok(stops.length > 0, 'the scenario did not exercise a striped-zone stop');
  for (const stop of stops) {
    // A driver latches the larger gap from its *predicted* queue slot. Near the far
    // edge that prediction can land outside the zone while the queue then compacts
    // the car back inside, so boundary cars are allowed to rest on the normal gap.
    // Anything deeper than that band would mean the latch rule itself is broken.
    const nearZoneEdge = stop.position >= zoneEnd - edgeBand;
    if (Math.abs(stop.restingGap - 6) > 1e-9) {
      assert.ok(nearZoneEdge,
        `car ${stop.carId} rested at ${stop.position.toFixed(2)}m on a ${stop.restingGap}m gap without latching`);
      continue;
    }
    assert.ok(Math.abs(stop.gap - 6) <= (nearZoneEdge ? 1.2 : .2),
      `car ${stop.carId} stopped with a ${stop.gap.toFixed(2)}m gap at ${stop.position.toFixed(2)}m`);
  }
});

test('default signal uses a 20-second green and a 23-second red phase', () => {
  restartSimulation();
  assert.equal(runHeadlessSimulation(1.05).phase, 'green');
  assert.equal(runHeadlessSimulation(21.05).phase, 'orange');
  assert.equal(runHeadlessSimulation(22.05).phase, 'red');
  assert.equal(runHeadlessSimulation(45.05).phase, 'green');
});

test('batch statistics run the exact car simulation for their configured duration', () => {
  const result = runStatisticsSimulation({
    greenPhase: 20, arrivalRate: 10, stripeCompliance: 100, stripeLength: 50,
  }, 42);
  assert.ok(result.throughput.every(count => count > 0));
  assert.ok(result.waitingTime.every(wait => wait >= 0));
});

test('aggressive drivers cross strictly more cars than very cautious drivers without crashes', () => {
  const parameters = {
    greenPhase: 20, arrivalRate: 10, stripeCompliance: 100, stripeLength: 50,
  };
  const cautious = runStatisticsSimulation({
    ...parameters, aggressivenessMin: 1, aggressivenessMax: 1,
  }, 42, 300);
  const aggressive = runStatisticsSimulation({
    ...parameters, aggressivenessMin: 5, aggressivenessMax: 5,
  }, 42, 300);

  assert.ok(aggressive.throughput.every((count, lane) => count > cautious.throughput[lane]),
    `expected ${aggressive.throughput} to exceed ${cautious.throughput}`);
  assert.equal(cautious.diagnostics.crashes, 0);
  assert.equal(aggressive.diagnostics.crashes, 0);
});

test('the visible simulation stops at five minutes and retains crossed counts', () => {
  restartSimulation();
  const result = runHeadlessSimulation(SIMULATION_DURATION_SECONDS);
  assert.equal(result.elapsed, SIMULATION_DURATION_SECONDS);
  assert.equal(result.running, false);
  assert.ok(result.lanes.every(lane => lane.crossed > 0));
});

test('a batch run may exceed the visible five-minute limit', () => {
  // The limit exists so the on-screen run ends with readable totals. Batch analysis is
  // not bound by it: a demand profile that builds and eases over an hour cannot be
  // observed inside five minutes, and silently truncating it produced a scenario that
  // measured only its own quiet opening.
  restartSimulation();
  const longRun = runHeadlessSimulation(SIMULATION_DURATION_SECONDS + 120);
  assert.equal(longRun.elapsed, SIMULATION_DURATION_SECONDS + 120);
  assert.ok(longRun.lanes.every(lane => lane.crossed > 0));
});

test('restart clears diagnostics and restores the initial vehicle state', () => {
  const restarted = restartSimulation();
  assert.equal(restarted.elapsed, 0);
  assert.equal(restarted.phase, 'red');
  assert.equal(restarted.running, true);
  assert.deepEqual(restarted.diagnostics, {
    crashes: 0, emergencyBrakes: 0, starts: [], prolongedOpenGaps: [],
    lineCrossings: [], stripedZoneStops: [], behaviorTransitions: [],
  });
  assert.equal(restarted.lanes.length, 2);
  for (const lane of restarted.lanes) {
    assert.equal(lane.cars.length, 10);
    assert.equal(lane.crossed, 0);
    assert.equal(lane.pendingArrivals, 0);
    assert.ok(lane.cars.every(car => car.speed === 0));
  }
});
