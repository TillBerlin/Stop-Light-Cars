import test from 'node:test';
import assert from 'node:assert/strict';
import { DRIVER_LEVELS, drawDriverLevel } from './driver-profiles.js';

test('driver levels progress monotonically from cautious to aggressive', () => {
  assert.equal(DRIVER_LEVELS.length, 5);
  for (let index = 1; index < DRIVER_LEVELS.length; index++) {
    const previous = DRIVER_LEVELS[index - 1];
    const current = DRIVER_LEVELS[index];
    assert.ok(current.startup < previous.startup);
    assert.ok(current.headway < previous.headway);
    assert.ok(current.jerk > previous.jerk);
    assert.ok(current.maxAccel > previous.maxAccel);
    assert.ok(current.brakeRate > previous.brakeRate);
  }
});

test('a fixed driver range always draws that level', () => {
  for (let index = 0; index < 100; index++) assert.equal(drawDriverLevel(3, 3), 3);
});

test('a seeded mixed range covers all five levels', () => {
  let state = 12345;
  const random = () => ((state = (1664525 * state + 1013904223) >>> 0) / 2 ** 32);
  const levels = new Set(Array.from({ length: 500 }, () => drawDriverLevel(1, 5, random)));
  assert.deepEqual([...levels].sort(), [1, 2, 3, 4, 5]);
});
