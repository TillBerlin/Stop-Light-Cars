const CAR_LENGTH = 5;
const STOP_POSITION = 0;
const ROAD_MIN = -24;
const ROAD_MAX = 110;
const INITIAL_CARS = 10;
const MAX_SPEED = 13.9;
const BRAKE_RATE = 5.5;
const SPAWN_BUFFER = 8;

const settings = { reaction: 0.8, acceleration: 2.2, safety: 6, phase: 12, topGap: 2.5, bottomGap: 5 };
const controlDefinitions = [
  { key: 'reaction', label: 'Reaction time', min: .1, max: 2.5, step: .1, unit: 's', note: 'Shared by both lanes' },
  { key: 'acceleration', label: 'Acceleration', min: .5, max: 4, step: .1, unit: 'm/s²', note: 'Shared by both lanes' },
  { key: 'safety', label: 'Safety distance', min: 2, max: 15, step: .5, unit: 'm', note: 'Shared by both lanes' },
  { key: 'phase', label: 'Green / red time', min: 5, max: 30, step: 1, unit: 's', note: 'Equal phase duration' },
  { key: 'topGap', label: 'Top resting gap', min: 1, max: 10, step: .5, unit: 'm', note: 'Lane A only', className: 'top' },
  { key: 'bottomGap', label: 'Bottom resting gap', min: 1, max: 10, step: .5, unit: 'm', note: 'Lane B only', className: 'bottom' },
];

const el = id => document.getElementById(id);
const controls = el('controls');
for (const def of controlDefinitions) {
  const wrapper = document.createElement('div');
  wrapper.className = `slider-control ${def.className || ''}`;
  wrapper.innerHTML = `<label for="${def.key}"><span>${def.label}</span><output>${settings[def.key].toFixed(def.step < 1 ? 1 : 0)} ${def.unit}</output></label><input id="${def.key}" type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${settings[def.key]}"><small>${def.note}</small>`;
  const input = wrapper.querySelector('input');
  const output = wrapper.querySelector('output');
  input.addEventListener('input', () => {
    settings[def.key] = Number(input.value);
    output.textContent = `${settings[def.key].toFixed(def.step < 1 ? 1 : 0)} ${def.unit}`;
    if (def.key === 'topGap') el('topGapMetric').textContent = `${settings.topGap.toFixed(1)}m`;
    if (def.key === 'bottomGap') el('bottomGapMetric').textContent = `${settings.bottomGap.toFixed(1)}m`;
    if (def.key === 'phase' && !state.running) state.phaseRemaining = settings.phase;
    if ((def.key === 'topGap' || def.key === 'bottomGap') && state.elapsed === 0) reset();
    updateUI();
  });
  controls.appendChild(wrapper);
}

let nextCarId = 1;
const state = { running: false, phase: 'red', phaseRemaining: settings.phase, elapsed: 0, lastFrame: 0, lanes: [] };

function createCar(position, laneIndex) {
  const node = document.createElement('div');
  node.className = 'car';
  node.innerHTML = '<div class="car-body"><i class="car-roof"></i><i class="car-window"></i></div><i class="wheel a"></i><i class="wheel b"></i>';
  (laneIndex === 0 ? el('laneTop') : el('laneBottom')).appendChild(node);
  return { id: nextCarId++, position, speed: 0, reactionClock: 0, crossed: false, braking: false, node };
}

function fillInitialLane(laneIndex, gap) {
  const cars = [];
  const front = 2.5;
  for (let i = 0; i < INITIAL_CARS; i++) cars.push(createCar(front + i * (CAR_LENGTH + gap), laneIndex));
  return { cars, crossed: 0, index: laneIndex };
}

function reset() {
  document.querySelectorAll('.car').forEach(node => node.remove());
  state.running = false; state.phase = 'red'; state.phaseRemaining = settings.phase; state.elapsed = 0; state.lastFrame = 0;
  state.lanes = [fillInitialLane(0, settings.topGap), fillInitialLane(1, settings.bottomGap)];
  updateUI(); render();
}

function desiredGap(speed) { return settings.safety + Math.max(0, speed * .35); }

function updateLane(lane, dt) {
  lane.cars.sort((a, b) => a.position - b.position);
  for (let i = 0; i < lane.cars.length; i++) {
    const car = lane.cars[i];
    const ahead = lane.cars[i - 1];
    const gap = ahead ? ahead.position - car.position - CAR_LENGTH : Infinity;
    const stopGap = car.position - STOP_POSITION - CAR_LENGTH / 2;
    const blockedByLight = state.phase === 'red' && car.position > STOP_POSITION && stopGap < desiredGap(car.speed) + 4;
    const hasSpace = gap >= settings.safety;
    const allowed = state.phase === 'green' && hasSpace;

    if (car.speed < .05 && allowed) car.reactionClock += dt;
    else if (!allowed && car.speed < .05) car.reactionClock = 0;

    const reacting = car.reactionClock >= settings.reaction;
    const tooClose = gap < desiredGap(car.speed);
    car.braking = tooClose || blockedByLight;
    if (car.braking) car.speed = Math.max(0, car.speed - BRAKE_RATE * dt);
    else if ((reacting || car.speed > .05) && (state.phase === 'green' || car.position < STOP_POSITION)) car.speed = Math.min(MAX_SPEED, car.speed + settings.acceleration * dt);
    else car.speed = Math.max(0, car.speed - BRAKE_RATE * dt);

    let nextPosition = car.position - car.speed * dt;
    if (ahead) nextPosition = Math.max(nextPosition, ahead.position + CAR_LENGTH + Math.max(1.2, settings.safety * .55));
    if (state.phase === 'red' && car.position > STOP_POSITION) nextPosition = Math.max(nextPosition, CAR_LENGTH / 2 + .5);
    car.position = nextPosition;

    if (!car.crossed && car.position < -CAR_LENGTH / 2) { car.crossed = true; lane.crossed++; }
  }

  for (const car of lane.cars.filter(c => c.position < ROAD_MIN - 15)) car.node.remove();
  lane.cars = lane.cars.filter(c => c.position >= ROAD_MIN - 15);

  // During red, arriving traffic replenishes the queue from the right.
  if (state.phase === 'red' && lane.cars.length < INITIAL_CARS) {
    const last = lane.cars.reduce((furthest, c) => Math.max(furthest, c.position), ROAD_MIN);
    const gap = lane.index === 0 ? settings.topGap : settings.bottomGap;
    if (last < ROAD_MAX - SPAWN_BUFFER) lane.cars.push(createCar(Math.max(ROAD_MAX, last + CAR_LENGTH + gap), lane.index));
  }
}

function tick(timestamp) {
  if (!state.running) return;
  if (!state.lastFrame) state.lastFrame = timestamp;
  const dt = Math.min((timestamp - state.lastFrame) / 1000, .05);
  state.lastFrame = timestamp; state.elapsed += dt; state.phaseRemaining -= dt;
  if (state.phaseRemaining <= 0) {
    state.phase = state.phase === 'red' ? 'green' : 'red';
    state.phaseRemaining += settings.phase;
  }
  state.lanes.forEach(lane => updateLane(lane, dt));
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
  const green = state.phase === 'green';
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
  el('throughput').textContent = state.elapsed ? (((a + b) / state.elapsed) * 60).toFixed(1) : '0.0';
  el('leaderText').textContent = !state.elapsed ? 'Start the simulation to compare' : a === b ? 'Both lanes are even' : `Lane ${a > b ? 'A' : 'B'} leads by ${Math.abs(a - b)} car${Math.abs(a - b) === 1 ? '' : 's'}`;
  el('playBtn').disabled = state.running; el('stopBtn').disabled = !state.running;
  el('playBtn').querySelector('span:last-child').textContent = state.elapsed ? 'Resume' : 'Play';
}

el('playBtn').addEventListener('click', () => { if (!state.running) { state.running = true; state.lastFrame = 0; updateUI(); requestAnimationFrame(tick); } });
el('stopBtn').addEventListener('click', () => { state.running = false; state.lastFrame = 0; updateUI(); });
el('restartBtn').addEventListener('click', reset);
reset();
