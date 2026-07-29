import {
  availableStartingBuffer,
  canCloseGapOnRed,
  cannotStopBeforeLine,
  distanceToCarAhead,
  followsThreeStripeRule,
  hasStartingClearance,
  hasRoomForArrival,
  movingSafetyDistance,
  needsEmergencyBraking,
  randomBetween,
  restingDistanceForPosition,
  shouldBrakeForTarget,
  shouldEnterQueueMode,
} from './car-physics.js';

const CAR_LENGTH_MIN = 3.8;
const CAR_LENGTH_MAX = 5.2;
const STOP_POSITION = 0;
const STOP_LINE_BUFFER = .5;
const ROAD_MIN = -24;
const ROAD_MAX = 110;
const INITIAL_CARS = 10;
const BRAKE_RATE = 5.5;
const EMERGENCY_BRAKE_RATE = 9;
const DRIVER_RESPONSE_TIME = .8;
const EMERGENCY_DISTANCE = 4;
const EMERGENCY_CLOSING_SPEED = 3;
const SPAWN_BUFFER = 8;
const INITIAL_RED_DURATION = 1;
const ORANGE_DURATION = 1;
const CREEP_SPEED = 1.5;
const STOPPED_SPEED = .05;
const STRIPE_SPACING = 2;
const STRIPE_ZONE_START = 0;
const STRIPE_ZONE_END = 50;
const DISTANCE_MARKER_SPACING = 10;
const LANE_B_STRIPE_GAP = STRIPE_SPACING * 3;
const CAR_COLORS = ['#ee6f59', '#f2b84b', '#57c6a3', '#4b9fd8', '#9b78cf', '#e887b7', '#e58b45', '#55aaa4'];

const settings = {
  startupMin: 1, startupMax: 2,
  accelerationMin: 1.5, accelerationMax: 2.5,
  clearingMin: 4, clearingMax: 4,
  phase: 12, arrivalRate: .5, speedLimit: 30, topGap: 2, bottomGap: LANE_B_STRIPE_GAP,
  stripeCompliance: 100,
};
const controlDefinitions = [
  { key: 'startup', label: 'Start-up time', min: .1, max: 2.5, step: .1, unit: 's', note: 'Uniform range per driver', range: true },
  { key: 'acceleration', label: 'Acceleration', min: .5, max: 4, step: .1, unit: 'm/s²', note: 'Uniform range per car', range: true },
  { key: 'clearing', label: 'Clearing distance', min: 2, max: 15, step: .5, unit: 'm', note: 'Uniform range per driver', range: true },
  { key: 'phase', label: 'Green / red time', min: 5, max: 30, step: 1, unit: 's', note: 'Equal phase duration' },
  { key: 'arrivalRate', label: 'Arrival rate', min: .2, max: 2, step: .1, unit: 'cars/s', note: 'New cars per lane' },
  { key: 'speedLimit', label: 'Speed limit', min: 10, max: 80, step: 1, unit: 'km/h', note: 'Maximum road speed' },
  { key: 'topGap', label: 'Top resting gap', min: 1, max: 10, step: .5, unit: 'm', note: 'Lane A only', className: 'top' },
  { key: 'stripeCompliance', label: '3-stripes compliance', min: 0, max: 100, step: 10, unit: '%', note: 'Share of Lane B drivers', className: 'bottom' },
];

const el = id => document.getElementById(id);
const controls = el('controls');
const mobileView = { overview: false };
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
    if (def.key === 'phase' && !state.running) {
      state.phaseRemaining = state.elapsed === 0 ? INITIAL_RED_DURATION : settings.phase;
    }
    if ((def.key === 'topGap' || def.key === 'bottomGap' || def.key === 'stripeCompliance') && state.elapsed === 0) reset();
    updateUI();
  });
  controls.appendChild(wrapper);
}

let nextCarId = 1;
let vehicleProfiles = [];
const state = { running: false, phase: 'red', phaseRemaining: INITIAL_RED_DURATION, elapsed: 0, arrivalClock: 0, lastFrame: 0, lanes: [] };

function vehicleProfile(index) {
  if (!vehicleProfiles[index]) {
    vehicleProfiles[index] = {
      color: CAR_COLORS[index % CAR_COLORS.length],
      length: randomBetween(CAR_LENGTH_MIN, CAR_LENGTH_MAX),
    };
  }
  return vehicleProfiles[index];
}

function createCar(position, laneIndex, profileIndex) {
  const profile = vehicleProfile(profileIndex);
  const node = document.createElement('div');
  node.className = 'car';
  node.style.setProperty('--car-color', profile.color);
  node.innerHTML = '<div class="car-body"><i class="car-roof"></i><i class="car-window"></i></div><i class="wheel a"></i><i class="wheel b"></i>';
  (laneIndex === 0 ? el('laneTop') : el('laneBottom')).appendChild(node);
  return {
    id: nextCarId++, position, length: profile.length, speed: 0, startupClock: 0, crossed: false, braking: false,
    queueMode: false, releasedFromQueue: false,
    committedToCross: false, node,
    startup: randomBetween(settings.startupMin, settings.startupMax),
    acceleration: randomBetween(settings.accelerationMin, settings.accelerationMax),
    clearing: randomBetween(settings.clearingMin, settings.clearingMax),
    followsThreeStripeRule: laneIndex === 1
      ? followsThreeStripeRule(settings.stripeCompliance)
      : false,
  };
}

function fillInitialLane(laneIndex, gap) {
  const cars = [];
  // Start the queue at the same boundary enforced by the red-light physics.
  // Otherwise the first update has to push the lead car away from the line.
  for (let i = 0; i < INITIAL_CARS; i++) {
    const length = vehicleProfile(i).length;
    const car = createCar(0, laneIndex, i);
    const normalPosition = i === 0
      ? STOP_POSITION + length / 2 + STOP_LINE_BUFFER
      : cars[i - 1].position + cars[i - 1].length / 2 + settings.topGap + length / 2;
    const restingGap = laneIndex === 1
      ? restingDistanceForPosition(normalPosition, car.followsThreeStripeRule, STRIPE_ZONE_START, STRIPE_ZONE_END, settings.topGap, gap)
      : settings.topGap;
    const position = i === 0
      ? normalPosition
      : cars[i - 1].position + cars[i - 1].length / 2 + restingGap + length / 2;
    car.position = position;
    car.queueMode = true;
    cars.push(car);
  }
  return { cars, crossed: 0, index: laneIndex, nextProfile: INITIAL_CARS };
}

function reset() {
  document.querySelectorAll('.car').forEach(node => node.remove());
  vehicleProfiles = [];
  state.running = false; state.phase = 'red'; state.phaseRemaining = INITIAL_RED_DURATION; state.elapsed = 0; state.arrivalClock = 0; state.lastFrame = 0;
  state.lanes = [fillInitialLane(0, settings.topGap), fillInitialLane(1, settings.bottomGap)];
  updateUI(); render();
}

function updateLane(lane, dt) {
  lane.cars.sort((a, b) => a.position - b.position);
  const snapshot = lane.cars.map(car => ({
    position: car.position,
    speed: car.speed,
    queueMode: car.queueMode,
    releasedFromQueue: car.releasedFromQueue,
  }));
  for (let i = 0; i < lane.cars.length; i++) {
    const car = lane.cars[i];
    const current = snapshot[i];
    const ahead = snapshot[i - 1];

    const aheadCar = lane.cars[i - 1];
    const gap = distanceToCarAhead(current, ahead, car.length, aheadCar?.length);
    const standstillGap = lane.index === 1
      ? restingDistanceForPosition(current.position, car.followsThreeStripeRule, STRIPE_ZONE_START, STRIPE_ZONE_END, settings.topGap, settings.bottomGap)
      : settings.topGap;
    const pastLine = current.position <= STOP_POSITION;
    const mayCrossSignal = state.phase === 'green' || pastLine || car.committedToCross;
    const signalRequiresStop = !mayCrossSignal;
    if (shouldEnterQueueMode(
      current.position,
      STOP_POSITION,
      STRIPE_ZONE_END,
      signalRequiresStop,
      Boolean(ahead?.queueMode),
      car.releasedFromQueue,
    )) {
      car.queueMode = true;
      car.releasedFromQueue = false;
    }

    const startingBuffer = availableStartingBuffer(gap, settings.topGap);
    const hasClearance = Boolean(ahead)
      && hasStartingClearance(state.phase, startingBuffer, car.clearing);
    const mayCreep = car.queueMode && ahead && gap > standstillGap && ahead.speed < STOPPED_SPEED;
    const closingGapOnRed = canCloseGapOnRed(
      state.phase,
      current.position,
      STOP_POSITION,
      gap,
      standstillGap,
    );
    const leaderHasStarted = ahead && (!ahead.queueMode || ahead.speed >= STOPPED_SPEED);
    const canBeginStartup = mayCrossSignal && (!ahead || leaderHasStarted);
    const allowed = (mayCrossSignal && (hasClearance || !ahead || leaderHasStarted)) || mayCreep || closingGapOnRed;

    if (current.speed < STOPPED_SPEED && canBeginStartup) car.startupClock += dt;
    else if (!canBeginStartup && current.speed < STOPPED_SPEED) car.startupClock = 0;

    // A green-light clearing gap bypasses the normal start-up delay. Otherwise,
    // the delay begins when the signal releases the lead car or its leader moves.
    const readyToStart = hasClearance || car.startupClock >= car.startup;
    if (car.queueMode && mayCrossSignal && readyToStart && (!ahead || hasClearance || leaderHasStarted)) {
      car.queueMode = false;
      car.releasedFromQueue = true;
    }
    let speedLimit = settings.speedLimit / 3.6;
    let shouldBrake = false;
    let brakingRate = BRAKE_RATE;

    if (ahead) {
      const safetyDistance = movingSafetyDistance(
        settings.topGap,
        current.speed,
        ahead.speed,
        BRAKE_RATE,
        DRIVER_RESPONSE_TIME,
      );
      shouldBrake = gap <= safetyDistance;
      if (car.queueMode) {
        shouldBrake ||= shouldBrakeForTarget(
          gap - standstillGap,
          current.speed,
          ahead.speed,
          BRAKE_RATE,
          DRIVER_RESPONSE_TIME,
        );
      }
      if (needsEmergencyBraking(
        gap,
        current.speed,
        ahead.speed,
        EMERGENCY_DISTANCE,
        EMERGENCY_CLOSING_SPEED,
      )) brakingRate = EMERGENCY_BRAKE_RATE;
      if (ahead.speed < STOPPED_SPEED && gap <= car.clearing) speedLimit = CREEP_SPEED;
    }

    if (!mayCrossSignal && current.position > STOP_POSITION) {
      // A driver who intends to stop may coast until braking is necessary, but
      // must not accelerate toward an empty red light. When there is a queue
      // ahead, it may still close that gap before stopping at the line.
      if (!closingGapOnRed && !mayCreep) speedLimit = Math.min(speedLimit, current.speed);
      const distanceToLine = current.position - (STOP_POSITION + car.length / 2 + STOP_LINE_BUFFER);
      shouldBrake ||= shouldBrakeForTarget(
        distanceToLine,
        current.speed,
        0,
        BRAKE_RATE,
        DRIVER_RESPONSE_TIME,
      );
    }

    if (!readyToStart && current.speed < STOPPED_SPEED && !mayCreep && !closingGapOnRed) speedLimit = 0;
    if (!mayCrossSignal && !ahead && current.speed < STOPPED_SPEED) speedLimit = 0;
    car.braking = shouldBrake || current.speed > speedLimit + STOPPED_SPEED;
    if (car.braking) car.speed = Math.max(0, current.speed - brakingRate * dt);
    else if (allowed || current.speed >= STOPPED_SPEED) {
      car.speed = Math.min(speedLimit, current.speed + car.acceleration * dt);
    } else car.speed = Math.max(0, current.speed - BRAKE_RATE * dt);

    let nextPosition = current.position - car.speed * dt;
    if (ahead) {
      // Zero is the only hard minimum. Resting distance is reached through
      // predictive braking and creeping, never by moving a car backwards.
      const collisionBoundary = ahead.position + (car.length + aheadCar.length) / 2;
      if (nextPosition < collisionBoundary) {
        nextPosition = collisionBoundary;
        car.speed = Math.min(car.speed, ahead.speed);
      }
    }
    if (!mayCrossSignal && current.position > STOP_POSITION) {
      const lineBoundary = STOP_POSITION + car.length / 2 + STOP_LINE_BUFFER;
      if (nextPosition < lineBoundary) {
        nextPosition = lineBoundary;
        car.speed = 0;
      }
    }
    car.position = nextPosition;

    if (car.position > STRIPE_ZONE_END) car.releasedFromQueue = false;

    if (car.committedToCross && car.position <= STOP_POSITION) car.committedToCross = false;

    if (!car.crossed && car.position < -car.length / 2) { car.crossed = true; lane.crossed++; }
  }

  for (const car of lane.cars.filter(c => c.position < ROAD_MIN - 15)) car.node.remove();
  lane.cars = lane.cars.filter(c => c.position >= ROAD_MIN - 15);

}

function beginOrangePhase() {
  state.phase = 'orange';
  state.phaseRemaining += ORANGE_DURATION;
  for (const lane of state.lanes) for (const car of lane.cars) {
    car.committedToCross = car.position > STOP_POSITION && cannotStopBeforeLine(
      car.position - (STOP_POSITION + car.length / 2 + STOP_LINE_BUFFER),
      car.speed,
      BRAKE_RATE,
      DRIVER_RESPONSE_TIME,
    );
  }
}

function addArrivingCars() {
  for (const lane of state.lanes) {
    const furthestPosition = lane.cars.reduce((furthest, car) => Math.max(furthest, car.position), ROAD_MIN);
    if (hasRoomForArrival(furthestPosition, ROAD_MAX, SPAWN_BUFFER)) {
      lane.cars.push(createCar(ROAD_MAX, lane.index, lane.nextProfile++));
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
  const arrivalInterval = 1 / settings.arrivalRate;
  while (state.arrivalClock >= arrivalInterval) {
    addArrivingCars();
    state.arrivalClock -= arrivalInterval;
  }
  render(); updateUI(); requestAnimationFrame(tick);
}

function render() {
  const isMobile = window.matchMedia('(max-width: 600px)').matches;
  const overview = !isMobile || mobileView.overview;
  const roadWidth = el('road').clientWidth;
  const stopFraction = isMobile && !overview ? .9 : .82;
  const visibleApproach = isMobile && !overview ? 55 : ROAD_MAX;
  const pixelsPerMeter = roadWidth * stopFraction / visibleApproach;
  el('road').style.setProperty('--stop-x', `${stopFraction * 100}%`);
  renderRoadMarkings(stopFraction, roadWidth, pixelsPerMeter);
  el('road').classList.toggle('compact-cars', CAR_LENGTH_MIN * pixelsPerMeter < 24);
  for (const lane of state.lanes) for (const car of lane.cars) {
    const carWidth = car.length * pixelsPerMeter;
    const x = (stopFraction * roadWidth - car.position * pixelsPerMeter) / roadWidth * 100;
    car.node.style.left = `${x}%`;
    car.node.style.top = lane.index === 0 ? '51%' : '49%';
    car.node.style.setProperty('--car-width', `${carWidth}px`);
    car.node.style.setProperty('--car-height', `${carWidth * 24 / 42}px`);
    car.node.classList.toggle('braking', car.braking && car.speed > .1);
    car.node.style.opacity = x < -5 || x > 103 ? '0' : '1';
  }
}

function positionForDistance(distance, stopFraction, roadWidth, pixelsPerMeter) {
  return (stopFraction * roadWidth - distance * pixelsPerMeter) / roadWidth * 100;
}

function renderRoadMarkings(stopFraction, roadWidth, pixelsPerMeter) {
  const stripeField = el('stripeField');
  const stripeCount = Math.floor((STRIPE_ZONE_END - STRIPE_ZONE_START) / STRIPE_SPACING) + 1;
  if (stripeField.children.length !== stripeCount) {
    stripeField.replaceChildren(...Array.from({ length: stripeCount }, () => {
      const stripe = document.createElement('i');
      stripe.className = 'distance-stripe';
      return stripe;
    }));
  }
  [...stripeField.children].forEach((stripe, index) => {
    const distance = STRIPE_ZONE_START + index * STRIPE_SPACING;
    const x = positionForDistance(distance, stopFraction, roadWidth, pixelsPerMeter);
    stripe.style.left = `${x}%`;
    stripe.hidden = x < 0 || x > 100;
  });

  // Traffic travels left to right. Place the sign beyond the upstream edge so
  // it remains visually to the left of every stripe.
  el('threeStripesSign').style.left = `${positionForDistance(STRIPE_ZONE_END, stopFraction, roadWidth, pixelsPerMeter)}%`;

  const distanceField = el('roadDistanceField');
  const markerCount = ROAD_MAX / DISTANCE_MARKER_SPACING;
  if (distanceField.children.length !== markerCount) {
    distanceField.replaceChildren(...Array.from({ length: markerCount }, (_, index) => {
      const distance = (index + 1) * DISTANCE_MARKER_SPACING;
      const marker = document.createElement('span');
      marker.className = 'road-distance-marker';
      marker.textContent = `${distance} m`;
      return marker;
    }));
  }
  [...distanceField.children].forEach((marker, index) => {
    const distance = (index + 1) * DISTANCE_MARKER_SPACING;
    const x = positionForDistance(distance, stopFraction, roadWidth, pixelsPerMeter);
    marker.style.left = `${x}%`;
    marker.hidden = x < 0 || x > 100;
  });
}

function updateViewMode() {
  const overview = mobileView.overview;
  el('roadWrap').classList.toggle('queue-view', !overview);
  el('viewToggle').setAttribute('aria-pressed', String(!overview));
  el('viewNote').textContent = overview
    ? 'Overview · showing the full road'
    : 'Queue detail · showing the area nearest the stop line';
  render();
}

function updateUI() {
  el('trafficLight').className = `traffic-light ${state.phase}`;
  el('trafficLight').setAttribute('aria-label', `Traffic light is ${state.phase}`);
  el('phaseLabel').textContent = state.phase.toUpperCase();
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
el('viewToggle').addEventListener('click', () => {
  mobileView.overview = !mobileView.overview;
  updateViewMode();
});
window.addEventListener('resize', render);
reset();
