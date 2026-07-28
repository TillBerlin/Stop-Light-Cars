export function distanceToCarAhead(car, carAhead, carLength) {
  return carAhead ? car.position - carAhead.position - carLength : Infinity;
}

export function hasStartingClearance(distance, safetyDistance) {
  return distance > safetyDistance;
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
