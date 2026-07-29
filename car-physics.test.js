import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canCloseGapOnRed,
  cannotStopBeforeLine,
  distanceToCarAhead,
  followsThreeStripeRule,
  hasStartingClearance,
  hasRoomForArrival,
  mustStopForRedLight,
  randomBetween,
  relativeStoppingDistance,
  restingDistanceForPosition,
  shouldBrakeForTarget,
} from './car-physics.js';

test('measures the clear distance in the direction cars travel', () => {
  const car = { position: 20 };
  const carAhead = { position: 8 };

  assert.equal(distanceToCarAhead(car, carAhead, 5), 7);
  assert.equal(distanceToCarAhead(car, undefined, 5), Infinity);
  assert.equal(distanceToCarAhead(car, carAhead, 4, 6), 7);
});

test('starts immediately only for a green-light gap bigger than the clearing distance', () => {
  assert.equal(hasStartingClearance('green', 6.1, 6), true);
  assert.equal(hasStartingClearance('green', 6, 6), false);
  assert.equal(hasStartingClearance('green', 5.9, 6), false);
  assert.equal(hasStartingClearance('green', Infinity, 6), true);
  assert.equal(hasStartingClearance('red', 6.1, 6), false);
  assert.equal(hasStartingClearance('orange', 6.1, 6), false);
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

test('makes each orange-light stopping decision from its own state', () => {
  assert.equal(cannotStopBeforeLine(19.9, 10, 5, 1), true);
  assert.equal(cannotStopBeforeLine(20, 10, 5, 1), false);
  assert.equal(cannotStopBeforeLine(1, 0, 5, 1), false);
});
