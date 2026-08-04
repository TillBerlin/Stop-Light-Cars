import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyScheduledControl,
  continuousAcceleration,
  CONTROL,
  desiredControl,
  recentMovement,
  requiredCollisionAvoidanceAcceleration,
  scheduleControl,
  startupCanFinish,
  startupOpportunity,
  limitAccelerationByJerk,
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

test('calculates continuous acceleration from speed, gap, and closing speed', () => {
  const base = {
    speed: 8, targetSpeed: 14, gap: 20, desiredGap: 14, leaderSpeed: 8,
    maximumAcceleration: 2, comfortableDeceleration: 2.5,
  };
  const steady = continuousAcceleration(base);
  const closing = continuousAcceleration({ ...base, leaderSpeed: 5 });
  const openRoad = continuousAcceleration({ ...base, gap: Infinity });
  assert.ok(openRoad > steady);
  assert.ok(steady > closing);
  assert.ok(closing >= -2.5);
});

test('limits ordinary acceleration changes by jerk', () => {
  assert.equal(limitAccelerationByJerk(0, 2, 2, .05), .1);
  assert.equal(limitAccelerationByJerk(-.4, -2, 2, .05), -.5);
  assert.equal(limitAccelerationByJerk(.3, .35, 2, .05), .35);
});

test('allows emergency braking to build at the brake-system jerk limit', () => {
  assert.equal(limitAccelerationByJerk(0, -4, 10, .05), -.5);
});

test('calculates the braking needed to remove closing speed before impact', () => {
  assert.equal(requiredCollisionAvoidanceAcceleration(4, 6, 4), -.5);
  assert.equal(requiredCollisionAvoidanceAcceleration(4, 4, 6), 0);
  assert.equal(requiredCollisionAvoidanceAcceleration(Infinity, 6, 4), 0);
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
  assert.equal(car.pendingControl.dueAt, 11.5);
  assert.equal(applyScheduledControl(car, 11.5), true);
  assert.equal(car.control, CONTROL.EMERGENCY_BRAKE);
});

test('uses time-to-contact hysteresis while emergency braking', () => {
  const request = activeControl => desiredControl({
    activeControl,
    gap: 3,
    desiredGap: 2,
    brakingGap: 2,
    emergencyGap: 2,
    followerSpeed: 4,
    leaderSpeed: 2,
    mustStop: false,
    targetDistance: Infinity,
    creepSpeed: 1.5,
  });
  assert.equal(request(CONTROL.HOLD), CONTROL.ACCELERATE);
  assert.equal(request(CONTROL.EMERGENCY_BRAKE), CONTROL.EMERGENCY_BRAKE);
});

test('accelerates into a green-light gap larger than the normal safety distance', () => {
  assert.equal(desiredControl({
    activeControl: CONTROL.ACCELERATE,
    gap: 6,
    desiredGap: 2,
    brakingGap: 2,
    emergencyGap: 1,
    followerSpeed: 0,
    leaderSpeed: 0,
    mustStop: false,
    targetDistance: 4,
    creepSpeed: 1.5,
  }), CONTROL.ACCELERATE);
});

test('uses comfort corrections rather than emergency braking below the preferred headway', () => {
  const request = (followerSpeed, leaderSpeed) => desiredControl({
    activeControl: CONTROL.HOLD,
    gap: 8,
    desiredGap: 23,
    brakingGap: 2,
    emergencyGap: 1,
    followerSpeed,
    leaderSpeed,
    mustStop: false,
    targetDistance: Infinity,
    creepSpeed: 1.5,
  });

  assert.equal(request(13.9, 13.9), CONTROL.COAST);
  assert.equal(request(13.9, 14.9), CONTROL.COAST);
  assert.equal(request(13.9, 13.4), CONTROL.COMFORT_BRAKE);
});

test('brakes inside the physical envelope and reserves emergency braking for short TTC', () => {
  const request = overrides => desiredControl({
    activeControl: CONTROL.HOLD,
    gap: 12,
    desiredGap: 23,
    brakingGap: 13,
    emergencyGap: 5,
    followerSpeed: 10,
    leaderSpeed: 9,
    mustStop: false,
    targetDistance: Infinity,
    creepSpeed: 1.5,
    ...overrides,
  });

  assert.equal(request({}), CONTROL.BRAKE);
  assert.equal(request({ gap: 2, followerSpeed: 13, leaderSpeed: 9 }), CONTROL.EMERGENCY_BRAKE);
});
