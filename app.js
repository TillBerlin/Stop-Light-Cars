import {
  canCloseGapOnRed,
  cannotStopBeforeLine,
  distanceToCarAhead,
  entranceGap,
  followsThreeStripeRule,
  hasRoomForArrival,
  movingSafetyDistance,
  randomBetween,
  restingDistanceForPosition,
  shouldBrakeForTarget,
  shouldEnterQueueMode,
  safeArrivalSpeed,
} from './car-physics.js';
import { carStatusLabel } from './car-status.js';
import {
  applyScheduledControl,
  BEHAVIOR,
  CONTROL,
  desiredControl,
  recentMovement,
  scheduleControl,
  startupCanFinish,
  startupOpportunity,
} from './driver-behavior.js';

const CAR_LENGTH_MIN = 3.8;
const CAR_LENGTH_MAX = 5.2;
const STOP_POSITION = 0;
const STOP_LINE_BUFFER = .5;
const ROAD_MIN = -24;
const ROAD_MAX = 110;
const INITIAL_CARS = 10;
// Keep the prediction model aligned with the deceleration cars actually use.
// Overestimating this rate makes drivers wait too long before braking and then
// reach a stopped leader before their gentle braking can finish.
const BRAKE_RATE = 2.5;
const EMERGENCY_BRAKE_RATE = 9;
const SPAWN_BUFFER = 8;
const INITIAL_RED_DURATION = 1;
const ORANGE_DURATION = 1;
const CREEP_SPEED = 1.5;
const STOPPED_SPEED = .05;
const REACTION_TIME = .5;
const MOVEMENT_WINDOW = .2;
const STOP_WINDOW = .1;
const STOP_POSITION_TOLERANCE = .15;
const COAST_RATE = .6;
const CREEP_ACCELERATION = .6;
const STRIPE_SPACING = 2;
const STRIPE_ZONE_START = 0;
const DISTANCE_MARKER_SPACING = 10;
const LANE_B_STRIPE_GAP = STRIPE_SPACING * 3;
const CAR_COLORS = ['#ee6f59', '#f2b84b', '#57c6a3', '#4b9fd8', '#9b78cf', '#e887b7', '#e58b45', '#55aaa4'];

const settings = {
  startupMin: 1.7, startupMax: 2,
  accelerationMin: 1.8, accelerationMax: 2.2,
  clearingMin: 4, clearingMax: 4,
  phase: 12, arrivalRate: 30, speedLimit: 50, topGap: 2, bottomGap: LANE_B_STRIPE_GAP,
  stripeCompliance: 100, stripeLength: 50, simulationSpeed: 1,
};
const controlDefinitions = [
  { key: 'startup', label: 'Start-up time', min: .1, max: 2.5, step: .1, unit: 's', note: 'Uniform range per driver', range: true },
  { key: 'acceleration', label: 'Acceleration', min: .5, max: 4, step: .1, unit: 'm/s²', note: 'Uniform range per car', range: true },
  { key: 'clearing', label: 'Clearing distance', min: 2, max: 15, step: .5, unit: 'm', note: 'Uniform range per driver', range: true },
  { key: 'phase', label: 'Green / red time', min: 5, max: 30, step: 1, unit: 's', note: 'Equal phase duration' },
  { key: 'arrivalRate', label: 'Arrival rate', min: 10, max: 60, step: 5, unit: 'cars/min', note: 'New cars per lane' },
  { key: 'speedLimit', label: 'Speed limit', min: 10, max: 80, step: 1, unit: 'km/h', note: 'Maximum road speed' },
  { key: 'topGap', label: 'Top resting gap', min: 1, max: 10, step: .5, unit: 'm', note: 'Lane A only', className: 'top' },
  { key: 'stripeCompliance', label: '3-stripes compliance', min: 0, max: 100, step: 10, unit: '%', note: 'Share of Lane B drivers', className: 'bottom' },
  { key: 'stripeLength', label: 'Striped zone length', min: 10, max: 100, step: 10, unit: 'm', note: 'Adjusts the number of stripes', className: 'bottom' },
  { key: 'simulationSpeed', label: 'Simulation speed', min: 0, max: 4, step: 1, unit: '×', note: '0.5× · 1× · 2× · 4× · 8×', values: [.5, 1, 2, 4, 8] },
];

const el = id => document.getElementById(id);
const controls = el('controls');
const mobileView = { overview: false };
let animationFrameId = null;
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
  const displayedValue = def.values ? def.values.indexOf(settings[def.key]) : settings[def.key];
  const formattedValue = def.values ? `${settings[def.key]}${def.unit}` : `${settings[def.key].toFixed(decimals)} ${def.unit}`;
  wrapper.innerHTML = `<label for="${def.key}"><span>${def.label}</span><output>${formattedValue}</output></label><input id="${def.key}" type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${displayedValue}"><small>${def.note}</small>`;
  const input = wrapper.querySelector('input');
  const output = wrapper.querySelector('output');
  input.addEventListener('input', () => {
    settings[def.key] = def.values ? def.values[Number(input.value)] : Number(input.value);
    output.textContent = def.values
      ? `${settings[def.key]}${def.unit}`
      : `${settings[def.key].toFixed(def.step < 1 ? 1 : 0)} ${def.unit}`;
    if (def.key === 'topGap') el('topGapMetric').textContent = `${settings.topGap.toFixed(1)}m`;
    if (def.key === 'phase' && !state.running) {
      state.phaseRemaining = state.elapsed === 0 ? INITIAL_RED_DURATION : settings.phase;
    }
    if ((def.key === 'topGap' || def.key === 'bottomGap' || def.key === 'stripeCompliance' || def.key === 'stripeLength') && state.elapsed === 0) reset();
    updateUI();
  });
  controls.appendChild(wrapper);
}

let nextCarId = 1;
let vehicleProfiles = [];
const state = { running: false, phase: 'red', phaseRemaining: INITIAL_RED_DURATION, elapsed: 0, arrivalClock: 0, lastFrame: null, lanes: [] };

function vehicleProfile(index) {
  if (!vehicleProfiles[index]) {
    vehicleProfiles[index] = {
      color: CAR_COLORS[index % CAR_COLORS.length],
      length: randomBetween(CAR_LENGTH_MIN, CAR_LENGTH_MAX),
    };
  }
  return vehicleProfiles[index];
}

function createCar(position, laneIndex, profileIndex, initialSpeed = 0) {
  const profile = vehicleProfile(profileIndex);
  const node = document.createElement('div');
  node.className = 'car';
  node.style.setProperty('--car-color', profile.color);
  node.innerHTML = '<span class="car-status">WAIT</span><div class="car-body"><i class="car-roof"></i><i class="car-window"></i></div><i class="wheel a"></i><i class="wheel b"></i>';
  (laneIndex === 0 ? el('laneTop') : el('laneBottom')).appendChild(node);
  return {
    id: nextCarId++, position, length: profile.length, speed: initialSpeed,
    startupTriggered: false, startupClock: 0, crossed: false, braking: false,
    queueMode: false, releasedFromQueue: false,
    committedToCross: false, node,
    behavior: initialSpeed >= STOPPED_SPEED ? BEHAVIOR.DRIVE : BEHAVIOR.WAIT,
    control: initialSpeed >= STOPPED_SPEED ? CONTROL.HOLD : CONTROL.HOLD,
    pendingControl: null, reactionTime: REACTION_TIME,
    movementSamples: [{ time: state.elapsed, position }],
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
      ? restingDistanceForPosition(normalPosition, car.followsThreeStripeRule, STRIPE_ZONE_START, settings.stripeLength, settings.topGap, gap)
      : settings.topGap;
    const position = i === 0
      ? normalPosition
      : cars[i - 1].position + cars[i - 1].length / 2 + restingGap + length / 2;
    car.position = position;
    car.queueMode = true;
    cars.push(car);
  }
  return { cars, crossed: 0, index: laneIndex, nextProfile: INITIAL_CARS, pendingArrivals: [] };
}

function reset() {
  document.querySelectorAll('.car').forEach(node => node.remove());
  vehicleProfiles = [];
  state.running = false; state.phase = 'red'; state.phaseRemaining = INITIAL_RED_DURATION; state.elapsed = 0; state.arrivalClock = 0; state.lastFrame = null;
  state.lanes = [fillInitialLane(0, settings.topGap), fillInitialLane(1, settings.bottomGap)];
  updateUI(); render();
}

function updateLane(lane, dt) {
  lane.cars.sort((a, b) => a.position - b.position);
  const snapshot = lane.cars.map(car => ({
    position: car.position,
    speed: car.speed,
    control: car.control,
    queueMode: car.queueMode,
    releasedFromQueue: car.releasedFromQueue,
    recentMovement: recentMovement(car.movementSamples, state.elapsed, MOVEMENT_WINDOW),
  }));
  for (let i = 0; i < lane.cars.length; i++) {
    const car = lane.cars[i];
    const current = snapshot[i];
    const ahead = snapshot[i - 1];

    const aheadCar = lane.cars[i - 1];
    const gap = distanceToCarAhead(current, ahead, car.length, aheadCar?.length);
    const standstillGap = lane.index === 1
      ? restingDistanceForPosition(current.position, car.followsThreeStripeRule, STRIPE_ZONE_START, settings.stripeLength, settings.topGap, settings.bottomGap)
      : settings.topGap;
    const pastLine = current.position <= STOP_POSITION;
    const mayCrossSignal = state.phase === 'green' || pastLine || car.committedToCross;
    const signalRequiresStop = !mayCrossSignal;
    const enteringQueue = shouldEnterQueueMode(
      current.position,
      STOP_POSITION,
      settings.stripeLength,
      signalRequiresStop,
      Boolean(ahead?.queueMode),
      car.releasedFromQueue,
    );
    if (enteringQueue) {
      if (!car.queueMode) {
        car.startupTriggered = false;
        car.startupClock = 0;
      }
      car.queueMode = true;
      car.releasedFromQueue = false;
    }

    const mayCreep = car.queueMode && ahead && gap > standstillGap && ahead.speed < STOPPED_SPEED;
    const closingGapOnRed = canCloseGapOnRed(
      state.phase,
      current.position,
      STOP_POSITION,
      gap,
      standstillGap,
    );
    if (car.behavior === BEHAVIOR.WAIT && startupOpportunity({
      phase: state.phase,
      hasLeader: Boolean(ahead),
      gap,
      clearingDistance: car.clearing,
      leaderMovement: ahead?.recentMovement || 0,
    })) {
      car.startupTriggered = true;
      car.startupClock = 0;
      car.behavior = BEHAVIOR.STARTUP;
      car.pendingControl = null;
      car.speed = 0;
    }

    if (car.behavior === BEHAVIOR.STARTUP) car.startupClock += dt;

    const readyToStart = car.startupClock >= car.startup;
    if (car.behavior === BEHAVIOR.STARTUP && readyToStart) {
      if (startupCanFinish(Boolean(ahead), gap, car.clearing)) {
        car.behavior = BEHAVIOR.DRIVE;
        car.control = CONTROL.ACCELERATE;
        car.startupTriggered = false;
        if (mayCrossSignal) {
          car.queueMode = false;
          car.releasedFromQueue = true;
        }
      } else {
        car.behavior = BEHAVIOR.WAIT;
        car.startupTriggered = false;
        car.startupClock = 0;
      }
    }
    let speedLimit = settings.speedLimit / 3.6;
    let desiredGap = settings.topGap;
    let targetDistance = Infinity;

    if (ahead) {
      desiredGap = movingSafetyDistance(
        standstillGap,
        current.speed,
        ahead.speed,
        BRAKE_RATE,
        car.reactionTime,
        ahead.control === CONTROL.EMERGENCY_BRAKE
          ? EMERGENCY_BRAKE_RATE
          : ahead.control === CONTROL.BRAKE ? BRAKE_RATE : 0,
      );
      targetDistance = gap - standstillGap;
      if (ahead.speed < STOPPED_SPEED && gap <= car.clearing) speedLimit = CREEP_SPEED;
    }

    if (!mayCrossSignal && current.position > STOP_POSITION) {
      // A driver who intends to stop may coast until braking is necessary, but
      // must not accelerate toward an empty red light. When there is a queue
      // ahead, it may still close that gap before stopping at the line.
      if (!closingGapOnRed && !mayCreep) speedLimit = Math.min(speedLimit, current.speed);
      const distanceToLine = current.position - (STOP_POSITION + car.length / 2 + STOP_LINE_BUFFER);
      if (!ahead) targetDistance = distanceToLine;
    }

    if (car.behavior === BEHAVIOR.DRIVE || car.behavior === BEHAVIOR.EMERGENCY_BRAKE) {
      let requestedControl = desiredControl({
        activeControl: car.control,
        gap,
        desiredGap,
        followerSpeed: current.speed,
        leaderSpeed: ahead?.speed || 0,
        mustStop: signalRequiresStop || Boolean(ahead?.queueMode),
        targetDistance,
        creepSpeed: CREEP_SPEED,
      });
      if (signalRequiresStop && !ahead && shouldBrakeForTarget(
        targetDistance,
        current.speed,
        0,
        BRAKE_RATE,
        car.reactionTime,
      )) requestedControl = CONTROL.BRAKE;
      scheduleControl(car, requestedControl, state.elapsed);
      applyScheduledControl(car, state.elapsed);
    }

    car.braking = car.control === CONTROL.BRAKE || car.control === CONTROL.EMERGENCY_BRAKE;
    if (car.behavior === BEHAVIOR.WAIT || car.behavior === BEHAVIOR.STARTUP) {
      car.speed = 0;
    } else if (car.control === CONTROL.EMERGENCY_BRAKE) {
      car.speed = Math.max(0, current.speed - EMERGENCY_BRAKE_RATE * dt);
    } else if (car.control === CONTROL.BRAKE) {
      car.speed = Math.max(0, current.speed - BRAKE_RATE * dt);
    } else if (car.control === CONTROL.COAST) {
      car.speed = Math.max(0, current.speed - COAST_RATE * dt);
    } else if (car.control === CONTROL.CREEP) {
      car.speed = Math.min(CREEP_SPEED, current.speed + CREEP_ACCELERATION * dt);
    } else if (car.control === CONTROL.ACCELERATE) {
      car.speed = Math.min(speedLimit, current.speed + car.acceleration * dt);
    } else {
      car.speed = Math.min(current.speed, speedLimit);
    }

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
    car.movementSamples.push({ time: state.elapsed, position: car.position });
    while (car.movementSamples.length > 2
      && car.movementSamples[1].time < state.elapsed - MOVEMENT_WINDOW) car.movementSamples.shift();

    const stopMovement = recentMovement(car.movementSamples, state.elapsed, STOP_WINDOW);
    const atTarget = targetDistance <= STOP_POSITION_TOLERANCE;
    if ((car.behavior === BEHAVIOR.DRIVE || car.behavior === BEHAVIOR.EMERGENCY_BRAKE)
      && car.speed < STOPPED_SPEED && stopMovement < STOPPED_SPEED * STOP_WINDOW
      && atTarget) {
      car.speed = 0;
      car.control = CONTROL.HOLD;
      car.pendingControl = null;
      car.behavior = BEHAVIOR.WAIT;
    }

    if (car.position > settings.stripeLength) car.releasedFromQueue = false;

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
      car.reactionTime,
    );
  }
}

function beginRedPhase() {
  state.phase = 'red';
  state.phaseRemaining += settings.phase;
}

function queueArrivingCars() {
  for (const lane of state.lanes) {
    lane.pendingArrivals.push({ profileIndex: lane.nextProfile++, arrivalTime: state.elapsed });
  }
}

function materializeArrivingCars() {
  for (const lane of state.lanes) {
    const pending = lane.pendingArrivals[0];
    if (!pending) continue;

    const leader = lane.cars.reduce((furthest, car) => (
      !furthest || car.position > furthest.position ? car : furthest
    ), undefined);
    const arrivingLength = vehicleProfile(pending.profileIndex).length;
    const gap = leader
      ? entranceGap(leader.position, ROAD_MAX, arrivingLength, leader.length)
      : Infinity;
    if (leader && !hasRoomForArrival(leader.position, ROAD_MAX, SPAWN_BUFFER)) continue;
    if (gap < settings.topGap) continue;

    const initialSpeed = safeArrivalSpeed(
      gap,
      leader?.speed || 0,
      settings.speedLimit / 3.6,
      settings.topGap,
      BRAKE_RATE,
      REACTION_TIME,
    );
    lane.cars.push(createCar(ROAD_MAX, lane.index, pending.profileIndex, initialSpeed));
    lane.pendingArrivals.shift();
  }
}

function tick(timestamp) {
  animationFrameId = null;
  if (!state.running) return;
  if (state.lastFrame === null) state.lastFrame = timestamp;
  let remaining = Math.min(Math.max(0, timestamp - state.lastFrame) / 1000, .05) * settings.simulationSpeed;
  state.lastFrame = timestamp;
  while (remaining > 0) {
    const dt = Math.min(remaining, .05);
    state.elapsed += dt; state.phaseRemaining -= dt;
    state.arrivalClock += dt;
    if (state.phaseRemaining <= 0) {
      if (state.phase === 'green') beginOrangePhase();
      else if (state.phase === 'orange') beginRedPhase();
      else {
        state.phase = 'green';
        state.phaseRemaining += settings.phase;
      }
    }
    state.lanes.forEach(lane => updateLane(lane, dt));
    const arrivalInterval = 60 / settings.arrivalRate;
    while (state.arrivalClock >= arrivalInterval) {
      queueArrivingCars();
      state.arrivalClock -= arrivalInterval;
    }
    materializeArrivingCars();
    remaining -= dt;
  }
  render(); updateUI(); scheduleAnimation();
}

function scheduleAnimation() {
  if (state.running && animationFrameId === null) {
    animationFrameId = requestAnimationFrame(tick);
  }
}

function cancelAnimation() {
  if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
  animationFrameId = null;
  state.lastFrame = null;
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
    renderCarStatus(car);
  }
}

function renderCarStatus(car) {
  const label = car.node.querySelector('.car-status');
  const status = carStatusLabel(car, STOPPED_SPEED);
  if (label.textContent !== status) label.textContent = status;
}

function positionForDistance(distance, stopFraction, roadWidth, pixelsPerMeter) {
  return (stopFraction * roadWidth - distance * pixelsPerMeter) / roadWidth * 100;
}

function renderRoadMarkings(stopFraction, roadWidth, pixelsPerMeter) {
  const stripeField = el('stripeField');
  const stripeCount = Math.floor((settings.stripeLength - STRIPE_ZONE_START) / STRIPE_SPACING) + 1;
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

  // Keep the sign centered in the striped zone as its selected length changes.
  el('threeStripesSign').style.left = `${positionForDistance(settings.stripeLength / 2, stopFraction, roadWidth, pixelsPerMeter)}%`;

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
  const pendingA = state.lanes[0]?.pendingArrivals.length || 0;
  const pendingB = state.lanes[1]?.pendingArrivals.length || 0;
  for (const [counter, count] of [[el('topArrivalQueue'), pendingA], [el('bottomArrivalQueue'), pendingB]]) {
    counter.hidden = count === 0;
    counter.textContent = `+${count} waiting`;
  }
  el('playBtn').disabled = state.running; el('stopBtn').disabled = !state.running;
  el('playBtn').querySelector('span:last-child').textContent = state.elapsed ? 'Resume' : 'Play';
}

el('playBtn').addEventListener('click', () => {
  if (!state.running) {
    state.running = true;
    state.lastFrame = null;
    updateUI();
    scheduleAnimation();
  }
});
el('stopBtn').addEventListener('click', () => {
  state.running = false;
  cancelAnimation();
  updateUI();
});
el('restartBtn').addEventListener('click', () => {
  // Restart begins a fresh run immediately, so its one-second opening red
  // phase counts down instead of remaining frozen until Play is pressed.
  cancelAnimation();
  reset();
  state.running = true;
  updateUI();
  scheduleAnimation();
});
el('viewToggle').addEventListener('click', () => {
  mobileView.overview = !mobileView.overview;
  updateViewMode();
});
window.addEventListener('resize', render);
reset();
