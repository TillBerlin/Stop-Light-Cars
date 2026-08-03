import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyScheduledControl,
  CONTROL,
  desiredControl,
  recentMovement,
  scheduleControl,
  startupCanFinish,
  startupOpportunity,
} from './driver-behavior.js';

test('starts on green movement or clearance and on a double clearance gap under red', () => {
  const base = { hasLeader: true, gap: 3, clearingDistance: 4, leaderMovement: 0 };
  assert.equal(startupOpportunity({ ...base, phase: 'green', leaderMovement: .05 }), true);
  assert.equal(startupOpportunity({ ...base, phase: 'green', gap: 4 }), true);
  assert.equal(startupOpportunity({ ...base, phase: 'red', gap: 7.99 }), false);
  assert.equal(startupOpportunity({ ...base, phase: 'red', gap: 8 }), true);
  assert.equal(startupOpportunity({ ...base, phase: 'orange', gap: 8 }), true);
  assert.equal(startupOpportunity({ ...base, phase: 'red', hasLeader: false, gap: Infinity }), false);
});

test('validates ordinary clearing distance when startup finishes', () => {
  assert.equal(startupCanFinish(true, 3.99, 4), false);
  assert.equal(startupCanFinish(true, 4, 4), true);
  assert.equal(startupCanFinish(false, Infinity, 4), true);
});

test('detects leader displacement over a sampling window', () => {
  const samples = [
    { time: 0, position: 10 },
    { time: .1, position: 9.98 },
    { time: .2, position: 9.94 },
  ];
  assert.ok(Math.abs(recentMovement(samples, .2, .2) - .06) < 1e-9);
});

test('delays controls by the driver reaction time and preserves stronger pending reactions', () => {
  const car = { control: CONTROL.ACCELERATE, pendingControl: null, reactionTime: .5 };
  scheduleControl(car, CONTROL.BRAKE, 10);
  scheduleControl(car, CONTROL.COAST, 10.1);
  assert.equal(car.pendingControl.control, CONTROL.BRAKE);
  assert.equal(applyScheduledControl(car, 10.49), false);
  assert.equal(applyScheduledControl(car, 10.5), true);
  assert.equal(car.control, CONTROL.BRAKE);

  scheduleControl(car, CONTROL.COAST, 11);
  scheduleControl(car, CONTROL.EMERGENCY_BRAKE, 11.1);
  assert.equal(car.pendingControl.control, CONTROL.EMERGENCY_BRAKE);
  assert.equal(car.pendingControl.dueAt, 11.6);
});

test('uses time-to-contact hysteresis while emergency braking', () => {
  const request = activeControl => desiredControl({
    activeControl,
    gap: 3,
    desiredGap: 2,
    followerSpeed: 4,
    leaderSpeed: 2,
    mustStop: false,
    targetDistance: Infinity,
    creepSpeed: 1.5,
  });
  assert.equal(request(CONTROL.HOLD), CONTROL.ACCELERATE);
  assert.equal(request(CONTROL.EMERGENCY_BRAKE), CONTROL.EMERGENCY_BRAKE);
});
