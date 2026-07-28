import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canCloseGapOnRed,
  distanceToCarAhead,
  hasStartingClearance,
  mustStopForRedLight,
  randomBetween,
} from './car-physics.js';

test('measures the clear distance in the direction cars travel', () => {
  const car = { position: 20 };
  const carAhead = { position: 8 };

  assert.equal(distanceToCarAhead(car, carAhead, 5), 7);
  assert.equal(distanceToCarAhead(car, undefined, 5), Infinity);
});

test('starts only when clearance is bigger than the safety distance', () => {
  assert.equal(hasStartingClearance(6.1, 6), true);
  assert.equal(hasStartingClearance(6, 6), false);
  assert.equal(hasStartingClearance(5.9, 6), false);
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

test('samples driver characteristics uniformly between their bounds', () => {
  assert.equal(randomBetween(0.5, 2.5, () => 0), 0.5);
  assert.equal(randomBetween(0.5, 2.5, () => 0.5), 1.5);
  assert.equal(randomBetween(0.5, 2.5, () => 1), 2.5);
});

test('does not consume randomness when both bounds are identical', () => {
  assert.equal(randomBetween(0.8, 0.8, () => { throw new Error('random called'); }), 0.8);
});
