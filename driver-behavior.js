export const BEHAVIOR = Object.freeze({
  WAIT: 'WAIT',
  STARTUP: 'STARTUP',
  DRIVE: 'DRIVE',
  EMERGENCY_BRAKE: 'EMERGENCY_BRAKE',
});

export const CONTROL = Object.freeze({
  ACCELERATE: 'accelerate',
  HOLD: 'hold',
  COAST: 'coast',
  BRAKE: 'brake',
  CREEP: 'creep',
  EMERGENCY_BRAKE: 'emergency-brake',
});

const PRIORITY = {
  [CONTROL.ACCELERATE]: 0,
  [CONTROL.HOLD]: 1,
  [CONTROL.COAST]: 2,
  [CONTROL.CREEP]: 2,
  [CONTROL.BRAKE]: 3,
  [CONTROL.EMERGENCY_BRAKE]: 4,
};

export function startupOpportunity({ phase, hasLeader, gap, clearingDistance, leaderMovement }) {
  if (!hasLeader) return phase === 'green';
  if (phase === 'green') return gap >= clearingDistance || leaderMovement >= .05;
  return gap >= clearingDistance * 2;
}

export function startupCanFinish(hasLeader, gap, clearingDistance) {
  return !hasLeader || gap >= clearingDistance;
}

export function timeToContact(gap, followerSpeed, leaderSpeed) {
  const closingSpeed = followerSpeed - leaderSpeed;
  return closingSpeed > 0 ? gap / closingSpeed : Infinity;
}

export function desiredControl({
  activeControl,
  gap,
  desiredGap,
  followerSpeed,
  leaderSpeed,
  mustStop,
  targetDistance,
  creepSpeed,
}) {
  const ttc = timeToContact(gap, followerSpeed, leaderSpeed);
  const emergencyThreshold = activeControl === CONTROL.EMERGENCY_BRAKE ? 2 : 1.2;
  if (ttc <= emergencyThreshold || gap <= Math.max(.5, desiredGap * .35)) {
    return CONTROL.EMERGENCY_BRAKE;
  }

  if (mustStop && targetDistance <= desiredGap) {
    if (followerSpeed <= creepSpeed && targetDistance > .15) return CONTROL.CREEP;
    return CONTROL.BRAKE;
  }

  if (gap < desiredGap) return CONTROL.BRAKE;
  if (gap < desiredGap * 1.15) return activeControl === CONTROL.BRAKE ? CONTROL.BRAKE : CONTROL.COAST;
  if (gap < desiredGap * 1.3) return CONTROL.HOLD;
  return CONTROL.ACCELERATE;
}

export function scheduleControl(car, requestedControl, now) {
  if (requestedControl === car.control) {
    return;
  }
  const pending = car.pendingControl;
  if (pending?.control === requestedControl) return;
  if (pending && PRIORITY[pending.control] > PRIORITY[requestedControl]) return;
  car.pendingControl = {
    control: requestedControl,
    // Escalating an already noticed hazard must not restart the driver's
    // reaction clock. The new response replaces the old one at its deadline.
    dueAt: pending?.dueAt ?? now + car.reactionTime,
  };
}

export function applyScheduledControl(car, now) {
  if (!car.pendingControl || car.pendingControl.dueAt > now) return false;
  car.control = car.pendingControl.control;
  car.pendingControl = null;
  car.behavior = car.control === CONTROL.EMERGENCY_BRAKE
    ? BEHAVIOR.EMERGENCY_BRAKE
    : BEHAVIOR.DRIVE;
  return true;
}

export function recentMovement(samples, now, windowSeconds) {
  if (samples.length < 2) return 0;
  const cutoff = now - windowSeconds;
  const oldest = samples.find(sample => sample.time >= cutoff) || samples.at(-1);
  return Math.max(0, oldest.position - samples.at(-1).position);
}
