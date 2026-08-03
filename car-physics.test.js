import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canCloseGapOnRed,
  canReleaseFromQueue,
  cannotStopBeforeLine,
  distanceToCarAhead,
  entranceGap,
  followsThreeStripeRule,
  hasStartingClearance,
  hasRoomForArrival,
  mustStopForRedLight,
  movingSafetyDistance,
  needsEmergencyBraking,
  randomBetween,
  relativeStoppingDistance,
  restingDistanceForPosition,
  shouldBrakeForTarget,
  shouldEnterQueueMode,
  shouldHoldForQueueStartup,
  shouldTriggerStartup,
  safeArrivalSpeed,
} from './car-physics.js';

test('measures the clear distance in the direction cars travel', () => {
  const car = { position: 20 };
  const carAhead = { position: 8 };

  assert.equal(distanceToCarAhead(car, carAhead, 5), 7);
  assert.equal(distanceToCarAhead(car, undefined, 5), Infinity);
  assert.equal(distanceToCarAhead(car, carAhead, 4, 6), 7);
});

test('starting clearance becomes available only when a green-light gap meets the clearing distance', () => {
  assert.equal(hasStartingClearance('green', 6.1, 6), true);
  assert.equal(hasStartingClearance('green', 6, 6), true);
  assert.equal(hasStartingClearance('green', 5.9, 6), false);
  assert.equal(hasStartingClearance('green', Infinity, 6), true);
  assert.equal(hasStartingClearance('red', 6.1, 6), false);
  assert.equal(hasStartingClearance('orange', 6.1, 6), false);
});

test('starting clearance tolerates arithmetic noise at any configured clearing distance', () => {
  assert.equal(hasStartingClearance('green', 6 - 1e-12, 6), true);
  assert.equal(hasStartingClearance('green', 7.3 - 1e-12, 7.3), true);
  assert.equal(hasStartingClearance('green', 7.3 - 1e-6, 7.3), false);
});

test('triggers each startup timer once its leader dependency is cleared', () => {
  assert.equal(shouldTriggerStartup('green', false, false, false, false), true);
  assert.equal(shouldTriggerStartup('green', false, true, false, true), true);
  assert.equal(shouldTriggerStartup('green', false, true, true, false), true);
  assert.equal(shouldTriggerStartup('green', false, true, false, false), false);
  assert.equal(shouldTriggerStartup('red', false, false, false, false), false);
  assert.equal(shouldTriggerStartup('green', true, false, false, false), false);
});

test('starting clearance uses the entire bumper-to-bumper gap', () => {
  assert.equal(hasStartingClearance('green', 6, 5), true);
  assert.equal(hasStartingClearance('green', 4.9, 5), false);
});

test('queue release always requires reaction time but clearance can substitute for leader movement', () => {
  assert.equal(canReleaseFromQueue(true, false, false, false), true);
  assert.equal(canReleaseFromQueue(true, true, true, false), true);
  assert.equal(canReleaseFromQueue(true, true, false, true), true);
  assert.equal(canReleaseFromQueue(true, true, false, false), false);
  assert.equal(canReleaseFromQueue(false, false, false, false), false);
  assert.equal(canReleaseFromQueue(false, true, true, false), false);
  assert.equal(canReleaseFromQueue(false, true, false, true), false);
});

test('does not hold a stopped non-queued car behind the queue startup timer', () => {
  const currentSpeed = 0;
  const speedLimit = shouldHoldForQueueStartup(
    false,
    false,
    currentSpeed,
    0.01,
    false,
    false,
  ) ? 0 : 30 / 3.6;
  const speedAfterUpdate = Math.min(speedLimit, currentSpeed + 2 * 0.1);

  assert.ok(speedAfterUpdate > 0);
});

test('holds only queued cars until their startup timer is ready', () => {
  assert.equal(shouldHoldForQueueStartup(true, false, 0, 0.01, false, false), true);
  assert.equal(shouldHoldForQueueStartup(false, false, 0, 0.01, false, false), false);
  assert.equal(shouldHoldForQueueStartup(true, true, 0, 0.01, false, false), false);
  assert.equal(shouldHoldForQueueStartup(true, false, 0, 0.01, true, false), false);
  assert.equal(shouldHoldForQueueStartup(true, false, 0, 0.01, false, true), false);
});

test('queue entry depends on an expected stop, not speed', () => {
  assert.equal(shouldEnterQueueMode(40, 0, 50, true, false), true);
  assert.equal(shouldEnterQueueMode(40, 0, 50, false, true), true);
  assert.equal(shouldEnterQueueMode(40, 0, 50, false, true, true), false);
  assert.equal(shouldEnterQueueMode(51, 0, 50, true, true), false);
  assert.equal(shouldEnterQueueMode(-1, 0, 50, true, true), false);
});

test('identifies cars approaching a red stop line', () => {
  assert.equal(mustStopForRedLight('red', 20, 0), true);
  assert.equal(mustStopForRedLight('green', 20, 0), false);
  assert.equal(mustStopForRedLight('red', -1, 0), false);
});

test('cars can close an available gap while the light is red', () => {
  assert.equal(canCloseGapOnRed('red', 20, 0, 6.1, 6), true);
  assert.equal(canCloseGapOnRed('red', 20, 0, 6, 6), false);
  assert.equal(canCloseGapOnRed('red', 20, 0, Infinity, 6), false);
  assert.equal(canCloseGapOnRed('green', 20, 0, 8, 6), false);
  assert.equal(canCloseGapOnRed('red', -1, 0, 8, 6), false);
});

test('allows an arrival only while the end of a lane has room', () => {
  assert.equal(hasRoomForArrival(101.9, 110, 8), true);
  assert.equal(hasRoomForArrival(102, 110, 8), false);
  assert.equal(hasRoomForArrival(109, 110, 8), false);
});

test('measures the actual bumper gap available at the lane entrance', () => {
  assert.equal(entranceGap(100, 110, 4, 6), 5);
});

test('arrival speed follows nearby traffic and uses extra distance to approach faster', () => {
  const parameters = [30 / 3.6, 2, 5.5, 0.8];
  const matchingSpeed = safeArrivalSpeed(2, 4, ...parameters);
  const distantSpeed = safeArrivalSpeed(30, 0, ...parameters);

  assert.ok(Math.abs(matchingSpeed - 4) < 0.001);
  assert.ok(distantSpeed > 0);
  assert.ok(distantSpeed <= 30 / 3.6);
  assert.equal(safeArrivalSpeed(Infinity, 0, ...parameters), 30 / 3.6);
});

test('samples driver characteristics uniformly between their bounds', () => {
  assert.equal(randomBetween(0.5, 2.5, () => 0), 0.5);
  assert.equal(randomBetween(0.5, 2.5, () => 0.5), 1.5);
  assert.equal(randomBetween(0.5, 2.5, () => 1), 2.5);
});

test('does not consume randomness when both bounds are identical', () => {
  assert.equal(randomBetween(0.8, 0.8, () => { throw new Error('random called'); }), 0.8);
});

test('assigns three-stripe adherence from the selected compliance percentage', () => {
  assert.equal(followsThreeStripeRule(100, () => 0.999), true);
  assert.equal(followsThreeStripeRule(0, () => 0), false);
  assert.equal(followsThreeStripeRule(60, () => 0.599), true);
  assert.equal(followsThreeStripeRule(60, () => 0.6), false);
});

test('uses the three-stripe gap only while a compliant car is in the striped zone', () => {
  const gapAt = (position, follows = true) => restingDistanceForPosition(position, follows, 30, 60, 2, 6);

  assert.equal(gapAt(29.9), 2);
  assert.equal(gapAt(30), 6);
  assert.equal(gapAt(45), 6);
  assert.equal(gapAt(60), 6);
  assert.equal(gapAt(60.1), 2);
  assert.equal(gapAt(45, false), 2);
});

test('calculates stopping distance from relative rather than absolute speed', () => {
  assert.equal(relativeStoppingDistance(10, 10, 5, 1), 0);
  assert.equal(relativeStoppingDistance(10, 5, 5, 1), 7.5);
  assert.equal(relativeStoppingDistance(10, 0, 5, 1), 20);
});

test('brakes early enough to preserve the requested resting distance', () => {
  assert.equal(shouldBrakeForTarget(7.5, 10, 5, 5, 1), true);
  assert.equal(shouldBrakeForTarget(7.6, 10, 5, 5, 1), false);
});

test('increases moving safety distance with closing speed, not shared forward speed', () => {
  assert.equal(movingSafetyDistance(2, 10, 10, 5, 1), 2);
  assert.equal(movingSafetyDistance(2, 10, 5, 5, 1), 14.5);
  assert.equal(movingSafetyDistance(2, 5, 10, 5, 1), 2);
  assert.equal(movingSafetyDistance(6, .2, .2, 5, .5), 6);
});

test('projects a braking leader through the driver reaction time', () => {
  assert.equal(movingSafetyDistance(2, 10, 10, 5, 1, 5), 12);
  assert.equal(movingSafetyDistance(2, 10, 2, 5, 1, 5), 21.6);
});

test('starts gentle braking early enough to stop behind a standing car at road speed', () => {
  const roadSpeed = 50 / 3.6;
  const restingGap = 2;
  const gentleBrakingRate = 2.5;
  const reactionTime = .5;
  const brakingGap = movingSafetyDistance(
    restingGap,
    roadSpeed,
    0,
    gentleBrakingRate,
    reactionTime,
  );

  // The safety envelope includes both distance travelled during the driver's
  // reaction and the distance consumed by the same gentle braking used in the
  // simulation. It must be substantially longer than the old envelope based
  // on an unrealistically strong 5.5 m/s² deceleration.
  assert.ok(brakingGap > 47);
  assert.equal(shouldBrakeForTarget(brakingGap, roadSpeed, 0, gentleBrakingRate, reactionTime), false);
  assert.equal(shouldBrakeForTarget(brakingGap - restingGap, roadSpeed, 0, gentleBrakingRate, reactionTime), true);
});

test('requires emergency braking only when close and considerably faster', () => {
  assert.equal(needsEmergencyBraking(4, 10, 7, 4, 3), true);
  assert.equal(needsEmergencyBraking(4.1, 10, 7, 4, 3), false);
  assert.equal(needsEmergencyBraking(4, 10, 7.1, 4, 3), false);
});

test('makes each orange-light stopping decision from its own state', () => {
  assert.equal(cannotStopBeforeLine(19.9, 10, 5, 1), true);
  assert.equal(cannotStopBeforeLine(20, 10, 5, 1), false);
  assert.equal(cannotStopBeforeLine(1, 0, 5, 1), false);
});
