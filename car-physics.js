export function distanceToCarAhead(car, carAhead, carLength, carAheadLength = carLength) {
  return carAhead ? car.position - carAhead.position - (carLength + carAheadLength) / 2 : Infinity;
}

export function hasStartingClearance(phase, distance, clearingDistance) {
  return phase === 'green' && distance >= clearingDistance;
}

export function shouldTriggerStartup(
  phase,
  startupTriggered,
  hasLeader,
  leaderHasStarted,
  hasClearance,
) {
  return phase === 'green'
    && !startupTriggered
    && (!hasLeader || leaderHasStarted || hasClearance);
}

export function canReleaseFromQueue(
  reactionComplete,
  hasLeader,
  leaderHasStarted,
  hasClearance,
) {
  return reactionComplete && (!hasLeader || leaderHasStarted || hasClearance);
}

export function availableStartingBuffer(gap, normalBaseGap) {
  return Math.max(0, gap - normalBaseGap);
}

export function shouldEnterQueueMode(
  position,
  stopPosition,
  queueZoneEnd,
  signalRequiresStop,
  leaderIsQueued,
  releasedFromCurrentQueue = false,
) {
  const inQueueZone = position > stopPosition && position <= queueZoneEnd;
  return inQueueZone
    && (signalRequiresStop || (leaderIsQueued && !releasedFromCurrentQueue));
}

export function relativeStoppingDistance(followerSpeed, leaderSpeed, brakingRate, responseTime = 0) {
  const closingSpeed = Math.max(0, followerSpeed - leaderSpeed);
  return closingSpeed * responseTime + (closingSpeed ** 2) / (2 * brakingRate);
}

export function shouldBrakeForTarget(
  availableDistance,
  followerSpeed,
  targetSpeed,
  brakingRate,
  responseTime = 0,
) {
  return availableDistance <= relativeStoppingDistance(
    followerSpeed,
    targetSpeed,
    brakingRate,
    responseTime,
  );
}

export function movingSafetyDistance(
  baseSafetyDistance,
  followerSpeed,
  leaderSpeed,
  brakingRate,
  responseTime,
) {
  const reactionDistance = Math.max(0, followerSpeed) * responseTime;
  const speedDifferenceDistance = Math.max(
    0,
    (followerSpeed ** 2 - leaderSpeed ** 2) / (2 * brakingRate),
  );
  return baseSafetyDistance + reactionDistance + speedDifferenceDistance;
}

export function needsEmergencyBraking(
  gap,
  followerSpeed,
  leaderSpeed,
  emergencyDistance,
  minimumClosingSpeed,
) {
  return gap <= emergencyDistance
    && followerSpeed - leaderSpeed >= minimumClosingSpeed;
}

export function cannotStopBeforeLine(distanceToLine, speed, brakingRate, responseTime = 0) {
  return distanceToLine < relativeStoppingDistance(speed, 0, brakingRate, responseTime);
}

export function mustStopForRedLight(phase, position, stopPosition) {
  return phase === 'red' && position > stopPosition;
}

export function canCloseGapOnRed(phase, position, stopPosition, distance, restingDistance) {
  return phase === 'red'
    && position > stopPosition
    && Number.isFinite(distance)
    && distance > restingDistance;
}

export function hasRoomForArrival(furthestPosition, roadMaximum, spawnBuffer) {
  return furthestPosition < roadMaximum - spawnBuffer;
}

export function randomBetween(minimum, maximum, random = Math.random) {
  if (minimum === maximum) return minimum;
  return minimum + random() * (maximum - minimum);
}

export function followsThreeStripeRule(compliancePercent, random = Math.random) {
  return random() * 100 < compliancePercent;
}

export function restingDistanceForPosition(
  position,
  followsStripeRule,
  stripeStart,
  stripeEnd,
  normalDistance,
  stripeDistance,
) {
  return followsStripeRule && position >= stripeStart && position <= stripeEnd
    ? stripeDistance
    : normalDistance;
}
