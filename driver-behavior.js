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
  COMFORT_BRAKE: 'comfort-brake',
  BRAKE: 'brake',
  CREEP: 'creep',
  EMERGENCY_BRAKE: 'emergency-brake',
});

const PRIORITY = {
  [CONTROL.ACCELERATE]: 0,
  [CONTROL.HOLD]: 1,
  [CONTROL.COAST]: 2,
  [CONTROL.COMFORT_BRAKE]: 3,
  [CONTROL.CREEP]: 2,
  [CONTROL.BRAKE]: 4,
  [CONTROL.EMERGENCY_BRAKE]: 5,
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

export function continuousAcceleration({
  speed,
  targetSpeed,
  gap = Infinity,
  desiredGap = 0,
  leaderSpeed = targetSpeed,
  maximumAcceleration,
  comfortableDeceleration,
}) {
  const freeRoadFactor = targetSpeed > 0 ? (speed / targetSpeed) ** 4 : 1;
  const closingSpeed = speed - leaderSpeed;
  const dynamicGap = Math.max(
    0,
    desiredGap + speed * closingSpeed
      / (2 * Math.sqrt(maximumAcceleration * comfortableDeceleration)),
  );
  const interactionFactor = Number.isFinite(gap)
    ? (dynamicGap / Math.max(gap, .01)) ** 2
    : 0;
  const acceleration = maximumAcceleration * (1 - freeRoadFactor - interactionFactor);
  return Math.max(-comfortableDeceleration, Math.min(maximumAcceleration, acceleration));
}

export function requiredCollisionAvoidanceAcceleration(gap, followerSpeed, leaderSpeed) {
  const closingSpeed = Math.max(0, followerSpeed - leaderSpeed);
  if (closingSpeed === 0 || !Number.isFinite(gap)) return 0;
  return -(closingSpeed ** 2) / (2 * Math.max(gap, .01));
}

export function limitAccelerationByJerk(current, requested, maximumJerk, dt) {
  const maximumChange = maximumJerk * dt;
  return Math.max(current - maximumChange, Math.min(current + maximumChange, requested));
}

export function desiredControl({
  activeControl,
  gap,
  desiredGap,
  brakingGap,
  emergencyGap,
  followerSpeed,
  leaderSpeed,
  mustStop,
  targetDistance,
  creepSpeed,
  minimumEmergencyClosingSpeed = .5,
}) {
  const ttc = timeToContact(gap, followerSpeed, leaderSpeed);
  const closingSpeed = followerSpeed - leaderSpeed;
  const emergencyThreshold = activeControl === CONTROL.EMERGENCY_BRAKE ? 1.5 : .8;
  const emergencyBrakingEnvelopeReached = gap <= emergencyGap;
  const emergencyAlreadyActive = activeControl === CONTROL.EMERGENCY_BRAKE;
  if (closingSpeed >= minimumEmergencyClosingSpeed
    && ttc <= emergencyThreshold
    && (emergencyBrakingEnvelopeReached || emergencyAlreadyActive)) {
    return CONTROL.EMERGENCY_BRAKE;
  }

  if (mustStop && targetDistance <= .15) return CONTROL.BRAKE;
  if (mustStop && followerSpeed <= creepSpeed && targetDistance <= desiredGap) {
    if (targetDistance > .15) return CONTROL.CREEP;
    return CONTROL.BRAKE;
  }

  // The physical braking envelope and the preferred time headway serve
  // different purposes. Crossing the former requires braking; falling short
  // of the latter merely calls for a comfortable correction.
  if (gap <= brakingGap) return CONTROL.BRAKE;
  if (gap < desiredGap && closingSpeed > 0) return CONTROL.COMFORT_BRAKE;
  if (gap < desiredGap * 1.15) return CONTROL.COAST;
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
