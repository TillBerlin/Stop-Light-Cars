import {
  canCloseGapOnRed,
  cannotStopBeforeLine,
  distanceToCarAhead,
  hasStartingClearance,
  hasRoomForArrival,
  randomBetween,
  shouldBrakeForTarget,
} from './car-physics.js';

const CAR_LENGTH = 5;
const STOP_POSITION = 0;
const STOP_LINE_BUFFER = .5;
const STOPPED_FRONT_POSITION = STOP_POSITION + CAR_LENGTH / 2 + STOP_LINE_BUFFER;
const ROAD_MIN = -24;
const ROAD_MAX = 110;
const INITIAL_CARS = 10;
const MAX_SPEED = 13.9;
const BRAKE_RATE = 5.5;
const SPAWN_BUFFER = 8;
const ARRIVAL_INTERVAL = 2;
const INITIAL_RED_DURATION = 1;
const ORANGE_DURATION = 1;
const CREEP_SPEED = 1.5;
const STOPPED_SPEED = .05;

const settings = {
  startupMin: 1, startupMax: 2,
  accelerationMin: 1.5, accelerationMax: 2.5,
  clearingMin: 4, clearingMax: 4,
  phase: 12, topGap: 2, bottomGap: 5,
};
const controlDefinitions = [
  { key: 'startup', label: 'Start-up time', min: .1, max: 2.5, step: .1, unit: 's', note: 'Uniform range per driver', range: true },
  { key: 'acceleration', label: 'Acceleration', min: .5, max: 4, step: .1, unit: 'm/s²', note: 'Uniform range per car', range: true },
  { key: 'clearing', label: 'Clearing distance', min: 2, max: 15, step: .5, unit: 'm', note: 'Uniform range per driver', range: true },
  { key: 'phase', label: 'Green / red time', min: 5, max: 30, step: 1, unit: 's', note: 'Equal phase duration' },
  { key: 'topGap', label: 'Top resting gap', min: 1, max: 10, step: .5, unit: 'm', note: 'Lane A only', className: 'top' },
  { key: 'bottomGap', label: 'Bottom resting gap', min: 1, max: 10, step: .5, unit: 'm', note: 'Lane B only', className: 'bottom' },
];

const el = id => document.getElementById(id);
const controls = el('controls');
for (const def of controlDefinitions) {
  const wrapper = document.createElement('div');
  wrapper.className = `slider-control ${def.range ? 'range-control' : ''} ${def.className || ''}`;
  const decimals = def.step < 1 ? 1 : 0;
  if (def.range) {
    const low = settings[`${def.key}Min`], high = settings[`${def.key}Max`];
    wrapper.innerHTML = `<label><span>${def.label}</span><output>${low.toFixed(decimals)}–${high.toFixed(decimals)} ${def.unit}</output></label><div class="range-inputs"><input class="range-min" aria-label="Minimum ${def.label.toLowerCase()}" type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${low}"><input class="range-max" aria-label="Maximum ${def.label.toLowerCase()}" type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${high}"></div><small>${def.note}</small>`;
    const [minimum, maximum] = wrapper.querySelectorAll('input');
    const output = wrapper.querySelector('output');
    const updateRange = event => {
      if (event.target === minimum && Number(minimum.value) > Number(maximum.value)) maximum.value = minimum.value;
      if (event.target === maximum && Number(maximum.value) < Number(minimum.value)) minimum.value = maximum.value;
      settings[`${def.key}Min`] = Number(minimum.value);
      settings[`${def.key}Max`] = Number(maximum.value);
      output.textContent = `${settings[`${def.key}Min`].toFixed(decimals)}–${settings[`${def.key}Max`].toFixed(decimals)} ${def.unit}`;
      if (state.elapsed === 0) reset();
    };
    minimum.addEventListener('input', updateRange);
    maximum.addEventListener('input', updateRange);
    controls.appendChild(wrapper);
    continue;
  }
  wrapper.innerHTML = `<label for="${def.key}"><span>${def.label}</span><output>${settings[def.key].toFixed(decimals)} ${def.unit}</output></label><input id="${def.key}" type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${settings[def.key]}"><small>${def.note}</small>`;
  const input = wrapper.querySelector('input');
  const output = wrapper.querySelector('output');
  input.addEventListener('input', () => {
    settings[def.key] = Number(input.value);
    output.textContent = `${settings[def.key].toFixed(def.step < 1 ? 1 : 0)} ${def.unit}`;
    if (def.key === 'topGap') el('topGapMetric').textContent = `${settings.topGap.toFixed(1)}m`;
    if (def.key === 'bottomGap') el('bottomGapMetric').textContent = `${settings.bottomGap.toFixed(1)}m`;
    if (def.key === 'phase' && !state.running) {
      state.phaseRemaining = state.elapsed === 0 ? INITIAL_RED_DURATION : settings.phase;
    }
    if ((def.key === 'topGap' || def.key === 'bottomGap') && state.elapsed === 0) reset();
    updateUI();
  });
  controls.appendChild(wrapper);
}

let nextCarId = 1;
const state = { running: false, phase: 'red', phaseRemaining: INITIAL_RED_DURATION, elapsed: 0, arrivalClock: 0, lastFrame: 0, lanes: [] };

function createCar(position, laneIndex) {
  const node = document.createElement('div');
  node.className = 'car';
  node.innerHTML = '<div class="car-body"><i class="car-roof"></i><i class="car-window"></i></div><i class="wheel a"></i><i class="wheel b"></i>';
  (laneIndex === 0 ? el('laneTop') : el('laneBottom')).appendChild(node);
  return {
    id: nextCarId++, position, speed: 0, startupClock: 0, crossed: false, braking: false,
    committedToCross: false, node,
    startup: randomBetween(settings.startupMin, settings.startupMax),
    acceleration: randomBetween(settings.accelerationMin, settings.accelerationMax),
    clearing: randomBetween(settings.clearingMin, settings.clearingMax),
  };
}

function fillInitialLane(laneIndex, gap) {
  const cars = [];
  // Start the queue at the same boundary enforced by the red-light physics.
  // Otherwise the first update has to push the lead car away from the line.
  const front = STOPPED_FRONT_POSITION;
  for (let i = 0; i < INITIAL_CARS; i++) cars.push(createCar(front + i * (CAR_LENGTH + gap), laneIndex));
  return { cars, crossed: 0, index: laneIndex };
}

function reset() {
  document.querySelectorAll('.car').forEach(node => node.remove());
  state.running = false; state.phase = 'red'; state.phaseRemaining = INITIAL_RED_DURATION; state.elapsed = 0; state.arrivalClock = 0; state.lastFrame = 0;
  state.lanes = [fillInitialLane(0, settings.topGap), fillInitialLane(1, settings.bottomGap)];
  updateUI(); render();
}

function updateLane(lane, dt) {
  lane.cars.sort((a, b) => a.position - b.position);
  const snapshot = lane.cars.map(car => ({ position: car.position, speed: car.speed }));
  for (let i = 0; i < lane.cars.length; i++) {
    const car = lane.cars[i];
    const current = snapshot[i];
    const ahead = snapshot[i - 1];

    const gap = distanceToCarAhead(current, ahead, CAR_LENGTH);
    const hasClearance = hasStartingClearance(state.phase, gap, car.clearing);
    const restingGap = lane.index === 0 ? settings.topGap : settings.bottomGap;
    const pastLine = current.position <= STOP_POSITION;
    const mayCrossSignal = state.phase === 'green' || pastLine || car.committedToCross;
    const mayCreep = ahead && gap > restingGap && ahead.speed < STOPPED_SPEED;
    const closingGapOnRed = canCloseGapOnRed(
      state.phase,
      current.position,
      STOP_POSITION,
      gap,
      restingGap,
    );
    const leaderHasStarted = ahead && ahead.speed >= STOPPED_SPEED;
    const canBeginStartup = mayCrossSignal && (!ahead || leaderHasStarted);
    const allowed = (mayCrossSignal && (hasClearance || !ahead || leaderHasStarted)) || mayCreep || closingGapOnRed;

    if (current.speed < STOPPED_SPEED && canBeginStartup) car.startupClock += dt;
    else if (!canBeginStartup && current.speed < STOPPED_SPEED) car.startupClock = 0;

    // A green-light clearing gap bypasses the normal start-up delay. Otherwise,
    // the delay begins when the signal releases the lead car or its leader moves.
    const readyToStart = hasClearance || car.startupClock >= car.startup;
    let speedLimit = MAX_SPEED;
    let shouldBrake = false;

    if (ahead) {
      const availableGap = gap - restingGap;
      shouldBrake = shouldBrakeForTarget(
        availableGap,
        current.speed,
        ahead.speed,
        BRAKE_RATE,
        0,
      );
      if (ahead.speed < STOPPED_SPEED && gap <= car.clearing) speedLimit = CREEP_SPEED;
    }

    if (!mayCrossSignal && current.position > STOP_POSITION) {
      // A driver who intends to stop may coast until braking is necessary, but
      // must not accelerate toward an empty red light. When there is a queue
      // ahead, it may still close that gap before stopping at the line.
      if (!closingGapOnRed && !mayCreep) speedLimit = Math.min(speedLimit, current.speed);
      const distanceToLine = current.position - STOPPED_FRONT_POSITION;
      shouldBrake ||= shouldBrakeForTarget(
        distanceToLine,
        current.speed,
        0,
        BRAKE_RATE,
        0,
      );
    }

    if (!readyToStart && current.speed < STOPPED_SPEED && !mayCreep && !closingGapOnRed) speedLimit = 0;
    if (!mayCrossSignal && !ahead && current.speed < STOPPED_SPEED) speedLimit = 0;
    car.braking = shouldBrake || current.speed > speedLimit + STOPPED_SPEED;
    if (car.braking) car.speed = Math.max(0, current.speed - BRAKE_RATE * dt);
    else if (allowed || current.speed >= STOPPED_SPEED) {
      car.speed = Math.min(speedLimit, current.speed + car.acceleration * dt);
    } else car.speed = Math.max(0, current.speed - BRAKE_RATE * dt);

    let nextPosition = current.position - car.speed * dt;
    if (ahead) {
      // Zero is the only hard minimum. Resting distance is reached through
      // predictive braking and creeping, never by moving a car backwards.
      const collisionBoundary = ahead.position + CAR_LENGTH;
      if (nextPosition < collisionBoundary) {
        nextPosition = collisionBoundary;
        car.speed = Math.min(car.speed, ahead.speed);
      }
    }
    if (!mayCrossSignal && current.position > STOP_POSITION) {
      const lineBoundary = STOPPED_FRONT_POSITION;
      if (nextPosition < lineBoundary) {
        nextPosition = lineBoundary;
        car.speed = 0;
      }
    }
    car.position = nextPosition;

    if (car.committedToCross && car.position <= STOP_POSITION) car.committedToCross = false;

    if (!car.crossed && car.position < -CAR_LENGTH / 2) { car.crossed = true; lane.crossed++; }
  }

  for (const car of lane.cars.filter(c => c.position < ROAD_MIN - 15)) car.node.remove();
  lane.cars = lane.cars.filter(c => c.position >= ROAD_MIN - 15);

}

function beginOrangePhase() {
  state.phase = 'orange';
  state.phaseRemaining += ORANGE_DURATION;
  for (const lane of state.lanes) for (const car of lane.cars) {
    car.committedToCross = car.position > STOP_POSITION && cannotStopBeforeLine(
      car.position - STOPPED_FRONT_POSITION,
      car.speed,
      BRAKE_RATE,
      0,
    );
  }
}

function addArrivingCars() {
  for (const lane of state.lanes) {
    const furthestPosition = lane.cars.reduce((furthest, car) => Math.max(furthest, car.position), ROAD_MIN);
    if (hasRoomForArrival(furthestPosition, ROAD_MAX, SPAWN_BUFFER)) {
      lane.cars.push(createCar(ROAD_MAX, lane.index));
    }
  }
}

function tick(timestamp) {
  if (!state.running) return;
  if (!state.lastFrame) state.lastFrame = timestamp;
  const dt = Math.min((timestamp - state.lastFrame) / 1000, .05);
  state.lastFrame = timestamp; state.elapsed += dt; state.phaseRemaining -= dt;
  state.arrivalClock += dt;
  if (state.phaseRemaining <= 0) {
    if (state.phase === 'green') beginOrangePhase();
    else {
      state.phase = state.phase === 'orange' ? 'red' : 'green';
      state.phaseRemaining += settings.phase;
    }
  }
  state.lanes.forEach(lane => updateLane(lane, dt));
  while (state.arrivalClock >= ARRIVAL_INTERVAL) {
    addArrivingCars();
    state.arrivalClock -= ARRIVAL_INTERVAL;
  }
  render(); updateUI(); requestAnimationFrame(tick);
}

function render() {
  for (const lane of state.lanes) for (const car of lane.cars) {
    const x = 82 - (car.position / (ROAD_MAX - ROAD_MIN)) * 82;
    car.node.style.left = `${x}%`;
    car.node.style.top = lane.index === 0 ? '51%' : '49%';
    car.node.classList.toggle('braking', car.braking && car.speed > .1);
    car.node.style.opacity = x < -5 || x > 103 ? '0' : '1';
  }
}

function updateUI() {
  el('trafficLight').className = `traffic-light ${state.phase}`;
  el('trafficLight').setAttribute('aria-label', `Traffic light is ${state.phase}`);
  el('signalMini').className = `signal-mini ${state.phase}`;
  el('phaseLabel').textContent = `${state.phase.toUpperCase()} PHASE`;
  el('phaseCountdown').textContent = `${Math.max(0, state.phaseRemaining).toFixed(1)}s`;
  el('runStatus').textContent = state.running ? 'RUNNING' : state.elapsed ? 'PAUSED' : 'READY';
  document.querySelector('.sim-toolbar').classList.toggle('running', state.running);
  const mins = Math.floor(state.elapsed / 60).toString().padStart(2, '0');
  el('simTime').textContent = `${mins}:${(state.elapsed % 60).toFixed(1).padStart(4, '0')}`;
  const a = state.lanes[0]?.crossed || 0, b = state.lanes[1]?.crossed || 0;
  el('topCrossed').textContent = a; el('bottomCrossed').textContent = b;
  el('playBtn').disabled = state.running; el('stopBtn').disabled = !state.running;
  el('playBtn').querySelector('span:last-child').textContent = state.elapsed ? 'Resume' : 'Play';
}

el('playBtn').addEventListener('click', () => { if (!state.running) { state.running = true; state.lastFrame = 0; updateUI(); requestAnimationFrame(tick); } });
el('stopBtn').addEventListener('click', () => { state.running = false; state.lastFrame = 0; updateUI(); });
el('restartBtn').addEventListener('click', () => {
  // Restart begins a fresh run immediately, so its one-second opening red
  // phase counts down instead of remaining frozen until Play is pressed.
  const animationWasRunning = state.running;
  reset();
  state.running = true;
  updateUI();
  if (!animationWasRunning) requestAnimationFrame(tick);
});
reset();
