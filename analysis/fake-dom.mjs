// app.js is browser code: at import time it reads the DOM to build its sliders and
// wire up buttons, so `import('./app.js')` in Node fails on `document is not defined`
// before any function can be called. Installing this minimal fake document first is
// what makes the engine runnable headlessly, for both the test suite and the
// parameter sweeps in this directory.
//
// The fake only needs to be faithful enough for app.js's module-level setup. The one
// subtle requirement is the innerHTML setter: app.js writes a slider's markup and then
// reads the inputs back with querySelectorAll, so the setter has to materialise the
// <input> and <output> elements the markup declares.

class FakeClassList {
  toggle() {}
  add() {}
  remove() {}
}

export class FakeElement {
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
      const status = new FakeElement('span');
      status.className = 'car-status';
      status.textContent = 'WAIT';
      this.appendChild(status);
    }
    for (const match of value.matchAll(/<input\b[^>]*value="([^"]*)"[^>]*>/g)) {
      const input = new FakeElement('input');
      input.value = match[1];
      this.appendChild(input);
    }
    if (value.includes('<output>')) this.appendChild(new FakeElement('output'));
  }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  remove() {
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    }
  }
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

const ELEMENT_IDS = [
  'controls', 'laneTop', 'laneBottom', 'road', 'stripeField', 'threeStripesSign',
  'roadDistanceField', 'roadWrap', 'viewToggle', 'viewNote', 'trafficLight', 'phaseLabel',
  'phaseCountdown', 'runStatus', 'simTime', 'topCrossed', 'bottomCrossed', 'topArrivalQueue',
  'bottomArrivalQueue', 'playBtn', 'stopBtn', 'restartBtn', 'topGapMetric', 'bottomGapMetric',
  'statisticsControls',
];

// Must be called before importing app.js.
export function installFakeBrowser() {
  const elements = Object.fromEntries(ELEMENT_IDS.map(id => [id, new FakeElement()]));
  elements.playBtn.appendChild(new FakeElement('span'));
  const toolbar = new FakeElement();
  toolbar.className = 'sim-toolbar';
  const roots = [...Object.values(elements), toolbar];
  globalThis.document = {
    createElement: tag => new FakeElement(tag),
    getElementById: id => elements[id] ||= new FakeElement(),
    querySelector: selector => (selector === '.sim-toolbar'
      ? toolbar
      : roots.flatMap(root => root.querySelectorAll(selector))[0]),
    querySelectorAll: selector => roots.flatMap(root => root.querySelectorAll(selector)),
  };
  globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener() {} };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  return elements;
}
