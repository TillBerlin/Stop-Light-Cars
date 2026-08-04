import {
  canCloseGapOnRed,
  cannotStopBeforeLine,
  desiredFollowingDistance,
  distanceToCarAhead,
  entranceGap,
  followsThreeStripeRule,
  hasRoomForArrival,
  minimumFollowingPosition,
  predictedStopPosition,
  preferredFollowingDistance,
  queuedStopPosition,
  randomBetween,
  restingDistanceForPosition,
  shouldEnterQueueMode,
  stopFallsWithinZone,
  safeArrivalSpeed,
} from './car-physics.js';
import { carStatusLabel } from './car-status.js';
import { DRIVER_LEVELS, drawDriverLevel } from './driver-profiles.js';
import {
  BEHAVIOR,
  CONTROL,
  continuousAcceleration,
  limitAccelerationByJerk,
  recentMovement,
  requiredCollisionAvoidanceAcceleration,
  startupCanFinish,
  startupOpportunity,
  timeToContact,
} from './driver-behavior.js';
import {
  buildStatisticsSeries,
  GRAPH_DURATION_SECONDS,
  graphAxes,
  graphMetrics,
  graphScale,
} from './statistics.js';

const CAR_LENGTH_MIN = 3.8;
const CAR_LENGTH_MAX = 5.2;
const STOP_POSITION = 0;
const STOP_LINE_BUFFER = .5;
const ROAD_MIN = -24;
const ROAD_MAX = 110;
const INITIAL_CARS = 10;
const SPAWN_BUFFER = 8;
const INITIAL_RED_DURATION = 1;
const ORANGE_DURATION = 1;
const CREEP_SPEED = 1.5;
const STOPPED_SPEED = .05;
const REACTION_TIME = .5;
const COLLISION_REACTION_HORIZON = 1;
// Ordinary pedal modulation is driver-limited; an emergency stop is
// limited by how fast the brake system can build pressure.
const EMERGENCY_JERK = 10;

export function jerkLimitFor(behavior, requestedAcceleration, currentAcceleration, ordinaryJerk = 2) {
  return behavior === BEHAVIOR.EMERGENCY_BRAKE
    && requestedAcceleration < currentAcceleration
    ? EMERGENCY_JERK
    : ordinaryJerk;
}
const MOVEMENT_WINDOW = .2;
const STOP_WINDOW = .1;
const STOP_POSITION_TOLERANCE = .15;
const STRIPE_SPACING = 2;
const STRIPE_ZONE_START = 0;
const DISTANCE_MARKER_SPACING = 10;
const LANE_B_STRIPE_GAP = STRIPE_SPACING * 3;
const RED_PHASE_OFFSET = 3;
export const SIMULATION_DURATION_SECONDS = 5 * 60;
const CAR_COLORS = ['#ee6f59', '#f2b84b', '#57c6a3', '#4b9fd8', '#9b78cf', '#e887b7', '#e58b45', '#55aaa4'];

const settings = {
  aggressivenessMin: 3, aggressivenessMax: 3,
  clearingMin: 4, clearingMax: 4,
  greenPhase: 20, arrivalRate: 10, speedLimit: 50, topGap: 2, bottomGap: LANE_B_STRIPE_GAP,
  stripeCompliance: 100, stripeLength: 50, simulationSpeed: 1,
};
const controlDefinitions = [
  { key: 'aggressiveness', label: 'Driver mix', min: 1, max: 5, step: 1, unit: '', range: true, note: 'Level is fixed when each car spawns' },
  { key: 'greenPhase', label: 'Green phase', min: 5, max: 30, step: 1, unit: 's', note: 'Red phase is green + 3s' },
  { key: 'arrivalRate', label: 'Arrival rate', min: 0, max: 20, step: 1, unit: 'cars/min', note: 'New cars per lane' },
  { key: 'speedLimit', label: 'Speed limit', min: 10, max: 80, step: 1, unit: 'km/h', note: 'Maximum road speed' },
  { key: 'stripeCompliance', label: '3-stripes compliance', min: 0, max: 100, step: 10, unit: '%', note: 'Share of Lane B drivers', className: 'bottom' },
  { key: 'stripeLength', label: 'Striped zone length', min: 10, max: 100, step: 10, unit: 'm', note: 'Adjusts the number of stripes', className: 'bottom' },
  { key: 'simulationSpeed', label: 'Simulation speed', min: 0, max: 4, step: 1, unit: '×', note: '0.5× · 1× · 2× · 4× · 8×', values: [.5, 1, 2, 4, 8] },
];

const el = id => document.getElementById(id);
const controls = el('controls');
const statisticsControls = el('statisticsControls');
const statisticsSettings = {
  ...Object.fromEntries(Object.keys(graphAxes).map(key => [key, settings[key]])),
  aggressiveness: 3, aggressivenessMin: 3, aggressivenessMax: 3,
};
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
      if (def.key === 'aggressiveness') {
        const lowProfile = DRIVER_LEVELS[settings.aggressivenessMin - 1];
        const highProfile = DRIVER_LEVELS[settings.aggressivenessMax - 1];
        output.textContent = lowProfile === highProfile
          ? `All ${lowProfile.label.toLowerCase()}`
          : `${lowProfile.label} - ${highProfile.label}`;
      } else output.textContent = `${settings[`${def.key}Min`].toFixed(decimals)}–${settings[`${def.key}Max`].toFixed(decimals)} ${def.unit}`;
      if (state.elapsed === 0) reset();
    };
    minimum.addEventListener('input', updateRange);
    maximum.addEventListener('input', updateRange);
    if (def.key === 'aggressiveness') output.textContent = 'All normal';
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
    if (def.key === 'greenPhase' && !state.running) {
      state.phaseRemaining = state.elapsed === 0 ? INITIAL_RED_DURATION : settings.greenPhase;
    }
    if ((def.key === 'topGap' || def.key === 'bottomGap' || def.key === 'stripeCompliance' || def.key === 'stripeLength') && state.elapsed === 0) reset();
    updateUI();
  });
  controls.appendChild(wrapper);
}

for (const [key, axis] of Object.entries(graphAxes)) {
  const wrapper = document.createElement('div');
  const isRange = key === 'aggressiveness';
  wrapper.className = `slider-control ${isRange ? 'range-control' : ''} ${key === 'stripeCompliance' || key === 'stripeLength' ? 'bottom' : ''}`;
  const inputId = `statistics-${key}`;
  wrapper.innerHTML = isRange
    ? `<label><span>${axis.label}</span><output>${statisticsSettings.aggressivenessMin}–${statisticsSettings.aggressivenessMax}</output></label><div class="range-inputs"><input class="range-min" aria-label="Minimum statistics driver aggressiveness" type="range" min="${axis.min}" max="${axis.max}" step="${axis.step}" value="${statisticsSettings.aggressivenessMin}"><input class="range-max" aria-label="Maximum statistics driver aggressiveness" type="range" min="${axis.min}" max="${axis.max}" step="${axis.step}" value="${statisticsSettings.aggressivenessMax}"></div><small>Random driver level within these bounds</small>`
    : `<label for="${inputId}"><span>${axis.label}</span><output>${statisticsSettings[key]} ${axis.unit}</output></label><input id="${inputId}" type="range" min="${axis.min}" max="${axis.max}" step="${axis.step}" value="${statisticsSettings[key]}"><small>Used only for batch statistics</small>`;
  const inputs = [...wrapper.querySelectorAll('input')];
  const output = wrapper.querySelector('output');
  inputs.forEach(input => input.addEventListener('input', event => {
    if (isRange) {
      const [minimum, maximum] = inputs;
      if (event.target === minimum && Number(minimum.value) > Number(maximum.value)) maximum.value = minimum.value;
      if (event.target === maximum && Number(maximum.value) < Number(minimum.value)) minimum.value = maximum.value;
      statisticsSettings.aggressivenessMin = Number(minimum.value);
      statisticsSettings.aggressivenessMax = Number(maximum.value);
      statisticsSettings.aggressiveness = statisticsSettings.aggressivenessMin;
      output.textContent = `${minimum.value}–${maximum.value}`;
    } else {
      statisticsSettings[key] = Number(input.value);
      output.textContent = `${statisticsSettings[key]} ${axis.unit}`;
    }
    markStatisticsStale();
  }));
  statisticsControls.appendChild(wrapper);
}

function chartPolyline(points, lane, xScale, yScale) {
  return points.map(point => `${xScale(point.x)},${yScale(point.lanes[lane])}`).join(' ');
}

function renderStatisticsGraph() {
  const axisKey = el('graphAxis').value || 'greenPhase';
  const metricKey = el('graphMetric').value || 'throughput';
  const axis = graphAxes[axisKey];
  const metric = graphMetrics[metricKey];
  const runs = Number(el('graphRuns').value);
  const duration = Number(el('graphDuration').value);
  const points = buildStatisticsSeries(axisKey, metricKey, statisticsSettings, runStatisticsSimulation, { runs, duration });
  const width = 760, height = 350, left = 66, right = 66, top = 22, bottom = 55;
  const { maximum, ticks } = graphScale(Math.max(...points.flatMap(point => point.lanes)) * 1.05);
  const xScale = value => left + (value - axis.min) / (axis.max - axis.min) * (width - left - right);
  const yScale = value => top + (1 - value / maximum) * (height - top - bottom);
  const ratios = points.map(point => point.relativeAdvantage).filter(Number.isFinite);
  const ratioMinimum = Math.min(...ratios, 1);
  const ratioMaximum = Math.max(...ratios, 1);
  const ratioPadding = Math.max(.05, (ratioMaximum - ratioMinimum) * .1);
  const ratioLow = Math.max(0, ratioMinimum - ratioPadding);
  const ratioHigh = ratioMaximum + ratioPadding;
  const ratioScale = value => top + (ratioHigh - value) / (ratioHigh - ratioLow) * (height - top - bottom);
  const ratioTicks = Array.from({ length: 5 }, (_, index) => ratioLow + (ratioHigh - ratioLow) * index / 4);
  const stride = Math.max(1, Math.ceil(points.length / 6));
  const xTicks = points.filter((_, index) => index % stride === 0 || index === points.length - 1);
  el('statisticsChart').innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${metric.label} by ${axis.label} for lanes A and B">
    ${ticks.map(value => `<line class="chart-grid" x1="${left}" y1="${yScale(value)}" x2="${width - right}" y2="${yScale(value)}"/><text class="chart-label" x="${left - 10}" y="${yScale(value) + 4}" text-anchor="end">${value}</text>`).join('')}
    ${ratioTicks.map(value => `<text class="chart-label ratio-label" x="${width - right + 10}" y="${ratioScale(value) + 4}">${value.toFixed(2)}</text>`).join('')}
    ${xTicks.map(point => `<text class="chart-label" x="${xScale(point.x)}" y="${height - 28}" text-anchor="middle">${point.x}${axis.unit}</text>`).join('')}
    <line class="chart-axis" x1="${left}" y1="${top}" x2="${left}" y2="${height - bottom}"/><line class="chart-axis" x1="${width - right}" y1="${top}" x2="${width - right}" y2="${height - bottom}"/><line class="chart-axis" x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}"/>
    <polyline class="chart-line lane-a" points="${chartPolyline(points, 0, xScale, yScale)}"/><polyline class="chart-line lane-b" points="${chartPolyline(points, 1, xScale, yScale)}"/>
    ${points.map(point => `<circle class="chart-point lane-a" cx="${xScale(point.x)}" cy="${yScale(point.lanes[0])}" r="3"/><circle class="chart-point lane-b" cx="${xScale(point.x)}" cy="${yScale(point.lanes[1])}" r="3"/>`).join('')}
    <polyline class="chart-line relative" points="${points.filter(point => Number.isFinite(point.relativeAdvantage)).map(point => `${xScale(point.x)},${ratioScale(point.relativeAdvantage)}`).join(' ')}"/>
    <text class="chart-title" x="${(left + width - right) / 2}" y="${height - 5}" text-anchor="middle">${axis.label}</text><text class="chart-title" transform="translate(15 ${(top + height - bottom) / 2}) rotate(-90)" text-anchor="middle">${metric.label} (${metric.unit})</text><text class="chart-title relative-title" transform="translate(${width - 10} ${(top + height - bottom) / 2}) rotate(90)" text-anchor="middle">Relative advantage (A/B)</text>
  </svg>`;
  el('fixedParameters').innerHTML = Object.entries(graphAxes).filter(([key]) => key !== axisKey).map(([key, def]) => {
    const value = key === 'aggressiveness'
      ? `${statisticsSettings.aggressivenessMin}-${statisticsSettings.aggressivenessMax}`
      : statisticsSettings[key];
    return `<div><dt>${def.label}</dt><dd>${value}${def.unit}</dd></div>`;
  }).join('');
  el('runStatisticsBtn').disabled = false;
  el('runStatisticsBtn').textContent = 'Run statistics';
  el('statisticsStatus').textContent = `Up to date: ${runs} runs × ${duration / 60} minutes.`;
}

function markStatisticsStale() {
  el('statisticsStatus').textContent = 'Settings changed. Run statistics to update the graph.';
}

let nextCarId = 1;
let vehicleProfiles = [];
let createVisibleCars = true;
const state = { running: false, phase: 'red', phaseRemaining: INITIAL_RED_DURATION, elapsed: 0, arrivalClock: 0, lastFrame: null, lanes: [], diagnostics: null };

export function roadRenderMetrics(roadWidth, isMobile = false, overview = false) {
  if (!Number.isFinite(roadWidth) || roadWidth <= 0) return null;
  const stopFraction = isMobile && !overview ? .9 : .82;
  const visibleApproach = isMobile && !overview ? 55 : ROAD_MAX;
  return {
    roadWidth,
    stopFraction,
    pixelsPerMeter: roadWidth * stopFraction / visibleApproach,
  };
}

function freshDiagnostics() {
  return {
    crashes: 0, emergencyBrakes: 0, starts: [], prolongedOpenGaps: [],
    lineCrossings: [], stripedZoneStops: [], behaviorTransitions: [],
  };
}

function transitionBehavior(car, behavior, reason, context = {}) {
  if (car.behavior === behavior) return;
  state.diagnostics.behaviorTransitions.push({
    carId: car.id,
    time: state.elapsed,
    from: car.behavior,
    to: behavior,
    reason,
    ...context,
  });
  car.behavior = behavior;
}

function vehicleProfile(index) {
  if (!vehicleProfiles[index]) {
    vehicleProfiles[index] = {
      color: CAR_COLORS[index % CAR_COLORS.length],
      length: randomBetween(CAR_LENGTH_MIN, CAR_LENGTH_MAX),
      driverLevel: drawDriverLevel(settings.aggressivenessMin, settings.aggressivenessMax),
    };
  }
  return vehicleProfiles[index];
}

function createCar(position, laneIndex, profileIndex, initialSpeed = 0, arrivalTime = 0) {
  const profile = vehicleProfile(profileIndex);
  const driver = DRIVER_LEVELS[profile.driverLevel - 1];
  const node = document.createElement('div');
  node.className = 'car';
  node.style.setProperty('--car-color', profile.color);
  node.innerHTML = '<span class="car-status">WAIT</span><div class="car-body"><i class="car-roof"></i><i class="car-window"></i></div><i class="wheel a"></i><i class="wheel b"></i>';
  if (createVisibleCars) (laneIndex === 0 ? el('laneTop') : el('laneBottom')).appendChild(node);
  return {
    id: nextCarId++, position, length: profile.length, speed: initialSpeed,
    startupTriggered: false, startupClock: 0, crossed: false, braking: false,
    queueMode: false, releasedFromQueue: false,
    queueRestingGap: settings.topGap,
    plannedStopPosition: null,
    committedToCross: false, node,
    behavior: initialSpeed >= STOPPED_SPEED ? BEHAVIOR.DRIVE : BEHAVIOR.WAIT,
    control: initialSpeed >= STOPPED_SPEED ? CONTROL.HOLD : CONTROL.HOLD,
    pendingControl: null, pendingBrake: null, reactionTime: REACTION_TIME,
    acceleration: 0, arrivalTime,
    movementSamples: [{ time: state.elapsed, position }],
    stoppedWithOpenGapSince: null,
    driverLevel: profile.driverLevel,
    jerk: driver.jerk,
    maxAcceleration: driver.maxAccel,
    brakeRate: driver.brakeRate,
    timeHeadway: driver.headway,
    startup: randomBetween(driver.startup - .15, driver.startup + .15),
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
    car.queueRestingGap = restingGap;
    cars.push(car);
  }
  return { cars, crossed: 0, totalWait: 0, index: laneIndex, nextProfile: INITIAL_CARS, pendingArrivals: [] };
}

function reset() {
  document.querySelectorAll('.car').forEach(node => node.remove());
  vehicleProfiles = [];
  state.running = false; state.phase = 'red'; state.phaseRemaining = INITIAL_RED_DURATION; state.elapsed = 0; state.arrivalClock = 0; state.lastFrame = null; state.diagnostics = freshDiagnostics();
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
    acceleration: car.acceleration,
  }));
  for (let i = 0; i < lane.cars.length; i++) {
    const car = lane.cars[i];
    const current = snapshot[i];
    const ahead = snapshot[i - 1];

    const aheadCar = lane.cars[i - 1];
    const gap = distanceToCarAhead(current, ahead, car.length, aheadCar?.length);
    const pastLine = current.position <= STOP_POSITION;
    const mayCrossSignal = state.phase === 'green' || pastLine || car.committedToCross;
    const signalRequiresStop = !mayCrossSignal;
    const leaderIsQueued = Boolean(aheadCar?.queueMode && !aheadCar.releasedFromQueue);
    const expectsToStop = signalRequiresStop || leaderIsQueued;
    if (lane.index === 1 && car.followsThreeStripeRule && expectsToStop) {
      const lineBoundary = STOP_POSITION + car.length / 2 + STOP_LINE_BUFFER;
      const ownStopPosition = predictedStopPosition(
        current.position,
        current.speed,
        car.brakeRate,
        car.reactionTime,
        lineBoundary,
      );
      const leaderStopPosition = aheadCar?.plannedStopPosition ?? (ahead
        ? predictedStopPosition(
          ahead.position,
          ahead.speed,
          car.brakeRate,
          car.reactionTime,
          STOP_POSITION + aheadCar.length / 2 + STOP_LINE_BUFFER,
        )
        : lineBoundary);
      const plannedQueuePosition = queuedStopPosition(
        ownStopPosition,
        ahead ? leaderStopPosition : Infinity,
        car.length,
        aheadCar?.length || 0,
        settings.bottomGap,
        aheadCar?.committedToCross,
      );
      car.plannedStopPosition = plannedQueuePosition;
      if (stopFallsWithinZone(
        plannedQueuePosition,
        STRIPE_ZONE_START,
        settings.stripeLength,
      )) car.queueRestingGap = settings.bottomGap;
    } else car.plannedStopPosition = null;
    // The striped standstill gap is a queue-formation rule. As soon as the
    // signal turns green, use the ordinary safety gap even while this car and
    // its leader are still marked as queued and have not begun moving yet.
    const queueIsForming = state.phase === 'red' && expectsToStop;
    const standstillGap = queueIsForming ? car.queueRestingGap : settings.topGap;
    const enteringQueue = shouldEnterQueueMode(
      current.position,
      STOP_POSITION,
      settings.stripeLength,
      signalRequiresStop,
      leaderIsQueued,
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
      transitionBehavior(car, BEHAVIOR.STARTUP, 'startup-opportunity', { gap });
      car.pendingControl = null;
      car.speed = 0;
    }

    if (car.behavior === BEHAVIOR.STARTUP) car.startupClock += dt;

    const readyToStart = car.startupClock >= car.startup;
    if (car.behavior === BEHAVIOR.STARTUP && readyToStart) {
      if (startupCanFinish(Boolean(ahead), gap, car.clearing)) {
        transitionBehavior(car, BEHAVIOR.DRIVE, 'startup-complete', { gap });
        state.diagnostics.starts.push({ carId: car.id, lane: lane.index, time: state.elapsed });
        car.control = CONTROL.ACCELERATE;
        car.startupTriggered = false;
        if (mayCrossSignal) {
          car.queueMode = false;
          car.releasedFromQueue = true;
          car.queueRestingGap = settings.topGap;
        }
      } else {
        transitionBehavior(car, BEHAVIOR.WAIT, 'startup-clearance-lost', { gap });
        car.startupTriggered = false;
        car.startupClock = 0;
      }
    }
    let speedLimit = settings.speedLimit / 3.6;
    let desiredGap = settings.topGap;
    let targetDistance = Infinity;

    if (ahead) {
      const preferredGap = preferredFollowingDistance(
        settings.topGap,
        current.speed,
        car.timeHeadway,
      );
      desiredGap = desiredFollowingDistance(preferredGap, standstillGap, queueIsForming);
      const targetGap = queueIsForming ? standstillGap : settings.topGap;
      targetDistance = gap - targetGap;
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

    let requestedAcceleration = 0;
    if (car.behavior === BEHAVIOR.DRIVE || car.behavior === BEHAVIOR.EMERGENCY_BRAKE) {
      const controllerGap = ahead ? gap : targetDistance;
      const controllerDesiredGap = ahead ? desiredGap : 0;
      const controllerLeaderSpeed = ahead?.speed || 0;
      const controllerTargetSpeed = signalRequiresStop && !ahead ? 0 : speedLimit;
      requestedAcceleration = continuousAcceleration({
        speed: current.speed,
        targetSpeed: controllerTargetSpeed,
        gap: controllerGap,
        desiredGap: controllerDesiredGap,
        leaderSpeed: controllerLeaderSpeed,
        maximumAcceleration: car.maxAcceleration,
        comfortableDeceleration: car.brakeRate,
      });

      const collisionTime = timeToContact(gap, current.speed, ahead?.speed || 0);
      const avoidanceAcceleration = ahead
        ? requiredCollisionAvoidanceAcceleration(gap, current.speed, ahead.speed)
        : 0;
      const surprisingBrake = car.behavior === BEHAVIOR.DRIVE && Boolean(ahead)
        && collisionTime <= COLLISION_REACTION_HORIZON
        && requestedAcceleration < current.acceleration;
      if (surprisingBrake) {
        if (!car.pendingBrake) {
          car.pendingBrake = { dueAt: state.elapsed + car.reactionTime, acceleration: avoidanceAcceleration };
        } else {
          car.pendingBrake.acceleration = Math.min(car.pendingBrake.acceleration, avoidanceAcceleration);
        }
      }

      if (car.pendingBrake?.dueAt > state.elapsed) {
        // During perception/reaction the driver maintains the existing pedal
        // input. A car that was already slowing therefore continues to slow.
        requestedAcceleration = current.acceleration;
      } else if (car.pendingBrake) {
        requestedAcceleration = Math.min(requestedAcceleration, car.pendingBrake.acceleration);
        car.pendingBrake = null;
        state.diagnostics.emergencyBrakes++;
        transitionBehavior(car, BEHAVIOR.EMERGENCY_BRAKE, 'collision-risk', {
          gap, collisionTime, requestedAcceleration,
        });
      } else if (car.behavior === BEHAVIOR.EMERGENCY_BRAKE
        && collisionTime <= COLLISION_REACTION_HORIZON * 1.5) {
        requestedAcceleration = Math.min(requestedAcceleration, avoidanceAcceleration);
      } else if (car.behavior === BEHAVIOR.EMERGENCY_BRAKE && collisionTime > COLLISION_REACTION_HORIZON * 1.5) {
        transitionBehavior(car, BEHAVIOR.DRIVE, 'collision-risk-cleared', { gap, collisionTime });
      }

      const jerkLimit = jerkLimitFor(
        car.behavior,
        requestedAcceleration,
        current.acceleration,
        car.jerk,
      );
      car.acceleration = limitAccelerationByJerk(
        current.acceleration,
        requestedAcceleration,
        jerkLimit,
        dt,
      );
      car.control = car.behavior === BEHAVIOR.EMERGENCY_BRAKE
        ? CONTROL.EMERGENCY_BRAKE
        : car.acceleration > .05 ? CONTROL.ACCELERATE
          : car.acceleration < -.05 ? CONTROL.COMFORT_BRAKE : CONTROL.HOLD;
    }

    car.braking = car.acceleration < 0;
    if (car.behavior === BEHAVIOR.WAIT || car.behavior === BEHAVIOR.STARTUP) {
      car.speed = 0;
    } else {
      car.speed = Math.max(0, Math.min(speedLimit, current.speed + car.acceleration * dt));
    }

    let nextPosition = current.position - car.speed * dt;
    if (ahead) {
      const collisionBoundary = ahead.position + (car.length + aheadCar.length) / 2;
      if (nextPosition < collisionBoundary - .001) state.diagnostics.crashes++;
      // Preserve an applicable resting gap once it is available. If the signal
      // changes after a smaller moving gap has already formed, never move the
      // follower backwards merely to manufacture extra space.
      const minimumPosition = minimumFollowingPosition(
        current.position,
        ahead.position,
        car.length,
        aheadCar.length,
        queueIsForming ? standstillGap : 0,
      );
      if (nextPosition < minimumPosition) {
        nextPosition = minimumPosition;
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
    if (current.position > STOP_POSITION && nextPosition <= STOP_POSITION) {
      state.diagnostics.lineCrossings.push({ carId: car.id, lane: lane.index, time: state.elapsed,
        phase: state.phase, committedDuringOrange: car.committedToCross });
    }
    car.position = nextPosition;
    const hasLargeOpenGap = Boolean(ahead) && gap > 10 && car.speed < STOPPED_SPEED;
    if (hasLargeOpenGap) {
      car.stoppedWithOpenGapSince ??= state.elapsed;
      if (state.elapsed - car.stoppedWithOpenGapSince > 3
        && !state.diagnostics.prolongedOpenGaps.some(event => event.carId === car.id)) {
        state.diagnostics.prolongedOpenGaps.push({ carId: car.id, lane: lane.index, time: state.elapsed, gap });
      }
    } else car.stoppedWithOpenGapSince = null;
    car.movementSamples.push({ time: state.elapsed, position: car.position });
    while (car.movementSamples.length > 2
      && car.movementSamples[1].time < state.elapsed - MOVEMENT_WINDOW) car.movementSamples.shift();

    const stopMovement = recentMovement(car.movementSamples, state.elapsed, STOP_WINDOW);
    const atTarget = targetDistance <= STOP_POSITION_TOLERANCE;
    if ((car.behavior === BEHAVIOR.DRIVE || car.behavior === BEHAVIOR.EMERGENCY_BRAKE)
      && car.speed < STOPPED_SPEED && stopMovement < STOPPED_SPEED * STOP_WINDOW
      && atTarget && car.acceleration <= 0) {
      car.speed = 0;
      car.control = CONTROL.HOLD;
      car.acceleration = 0;
      car.pendingControl = null;
      car.pendingBrake = null;
      transitionBehavior(car, BEHAVIOR.WAIT, 'settled-at-target', {
        gap, targetDistance, speed: car.speed,
      });
      if (state.phase === 'red' && lane.index === 1 && aheadCar
        && car.followsThreeStripeRule
        && car.position >= STRIPE_ZONE_START && car.position <= settings.stripeLength) {
        state.diagnostics.stripedZoneStops.push({ carId: car.id, time: state.elapsed,
          gap: distanceToCarAhead(car, aheadCar, car.length, aheadCar.length) });
      }
    }

    if (car.position > settings.stripeLength) car.releasedFromQueue = false;

    if (car.committedToCross && car.position <= STOP_POSITION) car.committedToCross = false;

    if (!car.crossed && car.position < -car.length / 2) {
      car.crossed = true;
      lane.crossed++;
      lane.totalWait += Math.max(0, state.elapsed - car.arrivalTime);
    }
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
      car.brakeRate,
      car.reactionTime,
    );
  }
}

function beginRedPhase() {
  state.phase = 'red';
  state.phaseRemaining += settings.greenPhase + RED_PHASE_OFFSET;
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
    const arrivingProfile = vehicleProfile(pending.profileIndex);
    const arrivingDriver = DRIVER_LEVELS[arrivingProfile.driverLevel - 1];
    const arrivingLength = arrivingProfile.length;
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
      arrivingDriver.brakeRate,
      REACTION_TIME,
      arrivingDriver.headway,
    );
    lane.cars.push(createCar(ROAD_MAX, lane.index, pending.profileIndex, initialSpeed, pending.arrivalTime));
    lane.pendingArrivals.shift();
  }
}

function tick(timestamp) {
  animationFrameId = null;
  if (!state.running) return;
  if (state.lastFrame === null) state.lastFrame = timestamp;
  const elapsed = Math.min(Math.max(0, timestamp - state.lastFrame) / 1000, .05) * settings.simulationSpeed;
  state.lastFrame = timestamp;
  advanceSimulation(elapsed);
  render(); updateUI(); scheduleAnimation();
}

function advanceSimulation(duration) {
  let remaining = Math.min(duration, SIMULATION_DURATION_SECONDS - state.elapsed);
  while (remaining > 0) {
    const dt = Math.min(remaining, .05);
    state.elapsed += dt; state.phaseRemaining -= dt;
    state.arrivalClock += dt;
    if (state.phaseRemaining <= 0) {
      if (state.phase === 'green') beginOrangePhase();
      else if (state.phase === 'orange') beginRedPhase();
      else {
        state.phase = 'green';
        state.phaseRemaining += settings.greenPhase;
      }
    }
    state.lanes.forEach(lane => updateLane(lane, dt));
    const arrivalInterval = settings.arrivalRate > 0 ? 60 / settings.arrivalRate : Infinity;
    while (state.arrivalClock >= arrivalInterval) {
      queueArrivingCars();
      state.arrivalClock -= arrivalInterval;
    }
    materializeArrivingCars();
    remaining -= dt;
  }
  if (state.elapsed >= SIMULATION_DURATION_SECONDS - 1e-9) {
    state.elapsed = SIMULATION_DURATION_SECONDS;
    state.running = false;
  }
}

export function runHeadlessSimulation(duration, step = .05) {
  const endTime = Math.min(duration, SIMULATION_DURATION_SECONDS);
  while (state.elapsed < endTime - 1e-9) advanceSimulation(Math.min(step, endTime - state.elapsed));
  return simulationSnapshot();
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => ((value = (1664525 * value + 1013904223) >>> 0) / 2 ** 32);
}

// Batch statistics deliberately call the same initialization, signal, arrival,
// driver-behavior and car-physics functions as the visible simulation. Globals
// are swapped temporarily so calculating the graph cannot disturb the live run.
export function runStatisticsSimulation(parameters, seed = 1, duration = GRAPH_DURATION_SECONDS) {
  const savedState = { ...state };
  const savedSettings = { ...settings };
  const savedProfiles = vehicleProfiles;
  const savedNextCarId = nextCarId;
  const savedRandom = Math.random;
  createVisibleCars = false;
  Object.assign(settings, parameters);
  Math.random = seededRandom(seed);
  vehicleProfiles = [];
  nextCarId = 1;
  Object.assign(state, {
    running: false, phase: 'red', phaseRemaining: INITIAL_RED_DURATION,
    elapsed: 0, arrivalClock: 0, lastFrame: null, diagnostics: freshDiagnostics(), lanes: [],
  });
  state.lanes = [fillInitialLane(0, settings.topGap), fillInitialLane(1, settings.bottomGap)];
  runHeadlessSimulation(duration);
  const result = {
    throughput: state.lanes.map(lane => lane.crossed),
    waitingTime: state.lanes.map(lane => lane.crossed ? lane.totalWait / lane.crossed : 0),
    diagnostics: structuredClone(state.diagnostics),
  };
  Object.assign(state, savedState);
  Object.assign(settings, savedSettings);
  vehicleProfiles = savedProfiles;
  nextCarId = savedNextCarId;
  Math.random = savedRandom;
  createVisibleCars = true;
  return result;
}

function simulationSnapshot() {
  return {
    elapsed: state.elapsed,
    phase: state.phase,
    running: state.running,
    diagnostics: structuredClone(state.diagnostics),
    lanes: state.lanes.map(lane => ({
      crossed: lane.crossed,
      pendingArrivals: lane.pendingArrivals.length,
      cars: lane.cars.map(car => ({ id: car.id, position: car.position, length: car.length, speed: car.speed })),
    })),
  };
}

export function restartSimulation() {
  cancelAnimation();
  reset();
  state.running = true;
  updateUI();
  scheduleAnimation();
  return simulationSnapshot();
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
  const metrics = roadRenderMetrics(el('road').clientWidth, isMobile, overview);
  // A newly restored tab or initially hidden embed can briefly report a zero
  // width. Do not replace valid car coordinates with NaN while layout settles;
  // the ResizeObserver below will render as soon as the road is visible.
  if (!metrics) return;
  const { roadWidth, stopFraction, pixelsPerMeter } = metrics;
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
  const complete = state.elapsed >= SIMULATION_DURATION_SECONDS;
  el('runStatus').textContent = complete ? 'COMPLETE' : state.running ? 'RUNNING' : state.elapsed ? 'PAUSED' : 'READY';
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
  el('playBtn').disabled = state.running || complete; el('stopBtn').disabled = !state.running;
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
  restartSimulation();
});
el('viewToggle').addEventListener('click', () => {
  mobileView.overview = !mobileView.overview;
  updateViewMode();
});
el('graphAxis').addEventListener('change', markStatisticsStale);
el('graphMetric').addEventListener('change', markStatisticsStale);
el('graphRuns').addEventListener('change', markStatisticsStale);
el('graphDuration').addEventListener('change', markStatisticsStale);
el('runStatisticsBtn').addEventListener('click', () => {
  const button = el('runStatisticsBtn');
  button.disabled = true;
  button.textContent = 'Running…';
  el('statisticsStatus').textContent = 'Running statistics…';
  // Let the busy state paint before the synchronous batch simulation starts.
  requestAnimationFrame(() => setTimeout(renderStatisticsGraph, 0));
});
window.addEventListener('resize', render);
if ('ResizeObserver' in window) {
  const roadResizeObserver = new window.ResizeObserver(render);
  roadResizeObserver.observe(el('road'));
}
reset();
markStatisticsStale();
