export function distanceToCarAhead(car, carAhead, carLength) {
  return carAhead ? car.position - carAhead.position - carLength : Infinity;
}

export function hasStartingClearance(distance, safetyDistance) {
  return distance > safetyDistance;
}

export function mustStopForRedLight(phase, position, stopPosition) {
  return phase === 'red' && position > stopPosition;
}
