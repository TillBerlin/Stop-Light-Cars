import test from 'node:test';
import assert from 'node:assert/strict';

class FakeClassList {
  toggle() {}
  add() {}
  remove() {}
}

class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag;
    this.children = [];
    this.style = { setProperty() {} };
    this.classList = new FakeClassList();
    this.attributes = {};
    this.clientWidth = 1000;
    this.hidden = false;
    this.textContent = '';
    this.value = '';
    this.disabled = false;
  }
  set className(value) { this._className = value; }
  get className() { return this._className || ''; }
  set innerHTML(value) {
    this.children = [];
    if (value.includes('class="car-status"')) {
      const status = new FakeElement('span'); status.className = 'car-status'; status.textContent = 'WAIT';
      this.appendChild(status);
    }
    for (const match of value.matchAll(/<input\b[^>]*value="([^"]*)"[^>]*>/g)) {
      const input = new FakeElement('input'); input.value = match[1]; this.appendChild(input);
    }
    if (value.includes('<output>')) this.appendChild(new FakeElement('output'));
  }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  addEventListener() {}
  setAttribute(name, value) { this.attributes[name] = value; }
  querySelectorAll(selector) {
    const all = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
    if (selector === '*') return all;
    if (selector === 'input') return all.filter(child => child.tagName === 'input');
    if (selector === 'output') return all.filter(child => child.tagName === 'output');
    if (selector === '.car-status') return all.filter(child => child.className.includes('car-status'));
    if (selector === '.car') return all.filter(child => child.className.split(' ').includes('car'));
    return [];
  }
  querySelector(selector) {
    if (selector === 'span:last-child') return this.children.at(-1) || this.appendChild(new FakeElement('span'));
    return this.querySelectorAll(selector)[0];
  }
}

function installFakeBrowser() {
  const ids = ['controls', 'laneTop', 'laneBottom', 'road', 'stripeField', 'threeStripesSign',
    'roadDistanceField', 'roadWrap', 'viewToggle', 'viewNote', 'trafficLight', 'phaseLabel',
    'phaseCountdown', 'runStatus', 'simTime', 'topCrossed', 'bottomCrossed', 'topArrivalQueue',
    'bottomArrivalQueue', 'playBtn', 'stopBtn', 'restartBtn', 'topGapMetric'];
  const elements = Object.fromEntries(ids.map(id => [id, new FakeElement()]));
  elements.playBtn.appendChild(new FakeElement('span'));
  const toolbar = new FakeElement(); toolbar.className = 'sim-toolbar';
  const roots = [...Object.values(elements), toolbar];
  globalThis.document = {
    createElement: tag => new FakeElement(tag),
    getElementById: id => elements[id] ||= new FakeElement(),
    querySelector: selector => selector === '.sim-toolbar' ? toolbar : roots.flatMap(root => root.querySelectorAll(selector))[0],
    querySelectorAll: selector => roots.flatMap(root => root.querySelectorAll(selector)),
  };
  globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener() {} };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
}

installFakeBrowser();
let randomState = 0x5eed1234;
Math.random = () => ((randomState = (1664525 * randomState + 1013904223) >>> 0) / 2 ** 32);
const { restartSimulation, roadRenderMetrics, runHeadlessSimulation, runStatisticsSimulation,
  SIMULATION_DURATION_SECONDS } = await import('./app.js');
const simulationResult = runHeadlessSimulation(60);

function seededRandom(seed) {
  let state = seed;
  return () => ((state = (1664525 * state + 1013904223) >>> 0) / 2 ** 32);
}

test('waits for a measurable road before calculating vehicle positions', () => {
  assert.equal(roadRenderMetrics(0), null);
  assert.equal(roadRenderMetrics(Number.NaN), null);
  assert.deepEqual(roadRenderMetrics(1000), {
    roadWidth: 1000,
    stopFraction: .82,
    pixelsPerMeter: 1000 * .82 / 110,
  });
});

test('default 60-second simulation keeps safety interventions within its regression budget', () => {
  assert.equal(simulationResult.diagnostics.crashes, 0,
    `observed ${simulationResult.diagnostics.crashes} collision corrections`);
  assert.ok(simulationResult.diagnostics.emergencyBrakes <= 10,
    `observed ${simulationResult.diagnostics.emergencyBrakes} emergency-brake events`);
});

test('no car remains stopped for three seconds behind a gap larger than ten metres', () => {
  assert.deepEqual(simulationResult.diagnostics.prolongedOpenGaps, []);
});

test('the first four initial cars in both lanes start during the first green phase', () => {
  for (const lane of [0, 1]) {
    const starts = simulationResult.diagnostics.starts.filter(start => start.lane === lane).slice(0, 4);
    assert.equal(starts.length, 4, `lane ${lane} did not start its first four cars`);
    assert.ok(starts.every(start => start.time <= 13), `lane ${lane} started a car after the first green`);
  }
});

test('cars do not repeat startup during the first green wave', () => {
  const startupEntries = simulationResult.diagnostics.behaviorTransitions.filter(transition => (
    transition.to === 'STARTUP' && transition.time <= 13
  ));
  const entriesByCar = Map.groupBy(startupEntries, transition => transition.carId);
  for (const [carId, entries] of entriesByCar) {
    assert.equal(entries.length, 1,
      `car ${carId} entered startup ${entries.length} times: ${JSON.stringify(simulationResult.diagnostics.behaviorTransitions.filter(transition => transition.carId === carId && transition.time <= 13))}`);
  }
});

test('cars do not repeat startup during the first green wave across several seeds', () => {
  for (const seed of [1, 42, 0x5eed1234, 0xdeadbeef, 0xffffffff]) {
    Math.random = seededRandom(seed);
    restartSimulation();
    const result = runHeadlessSimulation(13);
    const startupEntries = result.diagnostics.behaviorTransitions.filter(transition => (
      transition.to === 'STARTUP'
    ));
    const entriesByCar = Map.groupBy(startupEntries, transition => transition.carId);
    for (const [carId, entries] of entriesByCar) {
      assert.equal(entries.length, 1,
        `seed ${seed}: car ${carId} entered startup ${entries.length} times: ${JSON.stringify(result.diagnostics.behaviorTransitions.filter(transition => transition.carId === carId))}`);
    }
  }
});

test('cars crossing on red were committed to crossing during orange', () => {
  const redCrossings = simulationResult.diagnostics.lineCrossings.filter(crossing => crossing.phase === 'red');
  assert.ok(redCrossings.every(crossing => crossing.committedDuringOrange),
    `observed an uncommitted red crossing: ${JSON.stringify(redCrossings)}`);
});

test('cars stopping in the striped zone on red leave about six metres', () => {
  const stops = simulationResult.diagnostics.stripedZoneStops;
  assert.ok(stops.length > 0, 'the scenario did not exercise a striped-zone stop');
  for (const stop of stops) {
    assert.ok(Math.abs(stop.gap - 6) <= .2,
      `car ${stop.carId} stopped with a ${stop.gap.toFixed(2)}m gap`);
  }
});

test('default signal uses a 20-second green and a 23-second red phase', () => {
  restartSimulation();
  assert.equal(runHeadlessSimulation(1.05).phase, 'green');
  assert.equal(runHeadlessSimulation(21.05).phase, 'orange');
  assert.equal(runHeadlessSimulation(22.05).phase, 'red');
  assert.equal(runHeadlessSimulation(45.05).phase, 'green');
});

test('batch statistics run the exact car simulation for their configured duration', () => {
  const result = runStatisticsSimulation({
    greenPhase: 20, arrivalRate: 10, stripeCompliance: 100, stripeLength: 50,
  }, 42);
  assert.ok(result.throughput.every(count => count > 0));
  assert.ok(result.waitingTime.every(wait => wait >= 0));
});

test('the visible simulation stops at five minutes and retains crossed counts', () => {
  restartSimulation();
  const result = runHeadlessSimulation(SIMULATION_DURATION_SECONDS + 60);
  assert.equal(result.elapsed, SIMULATION_DURATION_SECONDS);
  assert.equal(result.running, false);
  assert.ok(result.lanes.every(lane => lane.crossed > 0));
});

test('restart clears diagnostics and restores the initial vehicle state', () => {
  const restarted = restartSimulation();
  assert.equal(restarted.elapsed, 0);
  assert.equal(restarted.phase, 'red');
  assert.equal(restarted.running, true);
  assert.deepEqual(restarted.diagnostics, {
    crashes: 0, emergencyBrakes: 0, starts: [], prolongedOpenGaps: [],
    lineCrossings: [], stripedZoneStops: [], behaviorTransitions: [],
  });
  assert.equal(restarted.lanes.length, 2);
  for (const lane of restarted.lanes) {
    assert.equal(lane.cars.length, 10);
    assert.equal(lane.crossed, 0);
    assert.equal(lane.pendingArrivals, 0);
    assert.ok(lane.cars.every(car => car.speed === 0));
  }
});
