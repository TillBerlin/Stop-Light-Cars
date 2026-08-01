import test from 'node:test';
import assert from 'node:assert/strict';

import { carStatusLabel } from './car-status.js';

const stoppedSpeed = .05;
const car = overrides => ({
  startupTriggered: false,
  startupClock: 0,
  startup: 1.8,
  speed: 0,
  ...overrides,
});

test('labels stopped and moving cars without changing their state', () => {
  const waiting = car({});
  const driving = car({ speed: stoppedSpeed });

  assert.equal(carStatusLabel(waiting, stoppedSpeed), 'WAIT');
  assert.equal(carStatusLabel(driving, stoppedSpeed), 'DRIVE');
  assert.deepEqual(waiting, car({}));
});

test('updates the startup countdown in 0.2-second steps', () => {
  assert.equal(carStatusLabel(car({ startupTriggered: true }), stoppedSpeed), 'STARTUP · 1.8 s');
  assert.equal(carStatusLabel(car({ startupTriggered: true, startupClock: .19 }), stoppedSpeed), 'STARTUP · 1.8 s');
  assert.equal(carStatusLabel(car({ startupTriggered: true, startupClock: .2 }), stoppedSpeed), 'STARTUP · 1.6 s');
  assert.equal(carStatusLabel(car({ startupTriggered: true, startupClock: 1.61 }), stoppedSpeed), 'STARTUP · 0.2 s');
});
