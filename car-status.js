const STARTUP_LABEL_INTERVAL = .2;

export function carStatusLabel(car, stoppedSpeed) {
  if (car.startupTriggered && car.speed < stoppedSpeed && car.startupClock < car.startup) {
    // Quantizing the remaining delay keeps the label on a 0.2-second cadence
    // without changing or feeding back into the simulation state.
    const remaining = Math.max(0, car.startup - car.startupClock);
    const displayed = Math.ceil((remaining - Number.EPSILON) / STARTUP_LABEL_INTERVAL)
      * STARTUP_LABEL_INTERVAL;
    return `STARTUP · ${displayed.toFixed(1)} s`;
  }
  return car.speed >= stoppedSpeed ? 'DRIVE' : 'WAIT';
}
