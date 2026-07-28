export function distanceToCarAhead(car, carAhead, carLength) {
  return carAhead ? car.position - carAhead.position - carLength : Infinity;
}

export function hasStartingClearance(distance, safetyDistance) {
  return distance > safetyDistance;
}

export function relativeStoppingDistance(followerSpeed, leaderSpeed, brakingRate, reactionTime = 0) {
  const closingSpeed = Math.max(0, followerSpeed - leaderSpeed);
  return closingSpeed * reactionTime + (closingSpeed ** 2) / (2 * brakingRate);
}

export function shouldBrakeForTarget(
  availableDistance,
  followerSpeed,
  targetSpeed,
  brakingRate,
  reactionTime = 0,
) {
  return availableDistance <= relativeStoppingDistance(
    followerSpeed,
    targetSpeed,
    brakingRate,
    reactionTime,
  );
}

export function cannotStopBeforeLine(distanceToLine, speed, brakingRate, reactionTime = 0) {
  return distanceToLine < relativeStoppingDistance(speed, 0, brakingRate, reactionTime);
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
