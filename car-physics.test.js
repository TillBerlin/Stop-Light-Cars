import test from 'node:test';
import assert from 'node:assert/strict';

import { distanceToCarAhead, hasStartingClearance } from './car-physics.js';

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
