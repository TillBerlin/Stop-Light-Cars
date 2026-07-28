import test from 'node:test';
import assert from 'node:assert/strict';

import {
  distanceToCarAhead,
  hasStartingClearance,
  mustStopForRedLight,
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

test('a red light immediately stops cars that have not crossed the stop line', () => {
  assert.equal(mustStopForRedLight('red', 20, 0), true);
  assert.equal(mustStopForRedLight('green', 20, 0), false);
  assert.equal(mustStopForRedLight('red', -1, 0), false);
});
