export function distanceToCarAhead(car, carAhead, carLength, carAheadLength = carLength) {
  return carAhead ? car.position - carAhead.position - (carLength + carAheadLength) / 2 : Infinity;
}

export function hasStartingClearance(phase, distance, clearingDistance) {
  const scale = Math.max(1, Math.abs(distance), Math.abs(clearingDistance));
  const tolerance = Math.max(1e-9, Number.EPSILON * scale * 8);
  return phase === 'green' && distance >= clearingDistance - tolerance;
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

export function shouldHoldForQueueStartup(
  queueMode,
  readyToStart,
  speed,
  stoppedSpeed,
  mayCreep,
  closingGapOnRed,
) {
  return queueMode
    && !readyToStart
    && speed < stoppedSpeed
    && !mayCreep
    && !closingGapOnRed;
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

export function predictedStopPosition(position, speed, brakingRate, responseTime = 0, minimumPosition = -Infinity) {
  return Math.max(
    minimumPosition,
    position - relativeStoppingDistance(speed, 0, brakingRate, responseTime),
  );
}

export function stopFallsWithinZone(stopPosition, zoneStart, zoneEnd) {
  return stopPosition >= zoneStart && stopPosition <= zoneEnd;
}

export function queuedStopPosition(
  ownStopPosition,
  leaderStopPosition,
  followerLength,
  leaderLength,
  restingGap,
  leaderCommitted = false,
) {
  if (!Number.isFinite(leaderStopPosition) || leaderCommitted) return ownStopPosition;
  return leaderStopPosition + (followerLength + leaderLength) / 2 + restingGap;
}

export function minimumFollowingPosition(
  currentPosition,
  leaderPosition,
  followerLength,
  leaderLength,
  restingGap = 0,
) {
  const collisionBoundary = leaderPosition + (followerLength + leaderLength) / 2;
  const restingBoundary = collisionBoundary + restingGap;
  return currentPosition >= restingBoundary ? restingBoundary : collisionBoundary;
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
  leaderDeceleration = 0,
  timeHeadway = 0,
) {
  // Project an already-braking leader through the response delay rather than
  // treating its sampled speed as constant until the follower reacts.
  const leaderResponseTime = leaderDeceleration > 0
    ? Math.min(responseTime, leaderSpeed / leaderDeceleration)
    : responseTime;
  const leaderResponseDistance = leaderSpeed * leaderResponseTime
    - .5 * leaderDeceleration * leaderResponseTime ** 2;
  const projectedLeaderSpeed = Math.max(
    0,
    leaderSpeed - leaderDeceleration * responseTime,
  );
  const reactionDistance = Math.max(
    0,
    followerSpeed * responseTime - leaderResponseDistance,
  );
  const leaderStoppingRate = leaderDeceleration || brakingRate;
  const speedDifferenceDistance = Math.max(
    0,
    followerSpeed ** 2 / (2 * brakingRate)
      - projectedLeaderSpeed ** 2 / (2 * leaderStoppingRate),
  );
  // The braking terms only protect against a speed difference. Without a
  // time headway, two cars travelling at the same speed would be content to
  // run at the standstill gap, leaving no room for ordinary human variation.
  return baseSafetyDistance
    + followerSpeed * timeHeadway
    + reactionDistance
    + speedDifferenceDistance;
}

export function desiredFollowingDistance(
  safetyDistance,
  standstillDistance,
  signalRequiresStop,
) {
  return signalRequiresStop
    ? Math.max(safetyDistance, standstillDistance)
    : safetyDistance;
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

export function entranceGap(leaderPosition, roadMaximum, arrivingLength, leaderLength) {
  return roadMaximum - leaderPosition - (arrivingLength + leaderLength) / 2;
}

export function safeArrivalSpeed(
  availableGap,
  leaderSpeed,
  speedLimit,
  baseSafetyDistance,
  brakingRate,
  responseTime,
  timeHeadway = 0,
) {
  if (!Number.isFinite(availableGap)) return speedLimit;
  if (availableGap < baseSafetyDistance) return 0;

  let low = Math.min(leaderSpeed, speedLimit);
  let high = speedLimit;
  for (let i = 0; i < 24; i++) {
    const candidate = (low + high) / 2;
    const requiredDistance = baseSafetyDistance
      + candidate * timeHeadway
      + relativeStoppingDistance(candidate, leaderSpeed, brakingRate, responseTime);
    if (requiredDistance <= availableGap) {
      low = candidate;
    } else {
      high = candidate;
    }
  }
  return low;
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
