import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRIVER_LEVELS,
  applyTraitNoise,
  drawDriverProfile,
  fractionToLevel,
  levelToFraction,
  profileAtFraction,
} from './driver-profiles.js';

const TRAITS = ['startup', 'headway', 'jerk', 'maxAccel', 'brakeRate'];

function seededRandom(seed) {
  let state = seed;
  return () => ((state = (1664525 * state + 1013904223) >>> 0) / 2 ** 32);
}

test('driver levels progress monotonically from cautious to aggressive', () => {
  assert.equal(DRIVER_LEVELS.length, 5);
  for (let index = 1; index < DRIVER_LEVELS.length; index++) {
    const previous = DRIVER_LEVELS[index - 1];
    const current = DRIVER_LEVELS[index];
    assert.ok(current.startup < previous.startup);
    assert.ok(current.headway < previous.headway);
    assert.ok(current.jerk > previous.jerk);
    assert.ok(current.maxAccel > previous.maxAccel);
    assert.ok(current.brakeRate > previous.brakeRate);
  }
});

test('the named levels are exact anchors on the continuous scale', () => {
  for (const level of DRIVER_LEVELS) {
    const profile = profileAtFraction(levelToFraction(level.level));
    for (const trait of TRAITS) {
      assert.ok(Math.abs(profile[trait] - level[trait]) < 1e-9,
        `level ${level.level} ${trait}: ${profile[trait]} !== ${level[trait]}`);
    }
  }
  assert.equal(levelToFraction(1), 0);
  assert.equal(levelToFraction(5), 1);
  assert.equal(fractionToLevel(0), 1);
  assert.equal(fractionToLevel(1), 5);
});

test('interpolation between anchors stays monotonic and lands between them', () => {
  const midpoint = profileAtFraction(levelToFraction(2.5));
  const cautious = DRIVER_LEVELS[1], normal = DRIVER_LEVELS[2];
  assert.ok(midpoint.startup < cautious.startup && midpoint.startup > normal.startup);
  assert.ok(midpoint.jerk > cautious.jerk && midpoint.jerk < normal.jerk);

  let previous = profileAtFraction(0);
  for (let step = 1; step <= 40; step++) {
    const current = profileAtFraction(step / 40);
    assert.ok(current.startup <= previous.startup + 1e-9);
    assert.ok(current.jerk >= previous.jerk - 1e-9);
    previous = current;
  }
});

test('fractions outside the scale are clamped rather than extrapolated', () => {
  assert.deepEqual(profileAtFraction(-3).startup, DRIVER_LEVELS[0].startup);
  assert.deepEqual(profileAtFraction(9).startup, DRIVER_LEVELS[4].startup);
});

test('a fixed range still varies drivers, because noise is applied per car', () => {
  const random = seededRandom(12345);
  const draws = Array.from({ length: 60 }, () => drawDriverProfile(3, 3, random));
  assert.ok(draws.every(profile => profile.fraction === levelToFraction(3)));
  // The whole point of the change: no two drivers in a queue are numerically identical.
  assert.equal(new Set(draws.map(profile => profile.startup)).size, draws.length);
  const mean = draws.reduce((sum, profile) => sum + profile.startup, 0) / draws.length;
  assert.ok(Math.abs(mean - DRIVER_LEVELS[2].startup) < .1, `mean startup drifted to ${mean}`);
});

test('a mixed range spreads drivers continuously across the whole span', () => {
  const random = seededRandom(999);
  const draws = Array.from({ length: 400 }, () => drawDriverProfile(1, 5, random));
  const fractions = draws.map(profile => profile.fraction);
  assert.ok(Math.min(...fractions) < .1);
  assert.ok(Math.max(...fractions) > .9);
  // Continuous, so intermediate personalities exist rather than only the five levels.
  assert.ok(fractions.some(value => value > .3 && value < .45));
  assert.ok(new Set(fractions).size > 300);
});

test('a bimodal mix places every driver at one bound or the other', () => {
  const random = seededRandom(4242);
  const draws = Array.from({ length: 200 }, () => drawDriverProfile(1, 5, random, { shape: 'bimodal' }));
  const fractions = new Set(draws.map(profile => profile.fraction));
  assert.deepEqual([...fractions].sort(), [0, 1]);
  const atLow = draws.filter(profile => profile.fraction === 0).length;
  assert.ok(atLow > 60 && atLow < 140, `expected a roughly even split, got ${atLow}/200`);
});

test('trait noise keeps every parameter physically plausible', () => {
  const random = seededRandom(77);
  for (let index = 0; index < 500; index++) {
    const profile = drawDriverProfile(1, 5, random);
    assert.ok(profile.startup >= .6 && profile.startup <= 3);
    assert.ok(profile.headway >= .4 && profile.headway <= 2.6);
    assert.ok(profile.jerk >= .4 && profile.jerk <= 5);
    assert.ok(profile.maxAccel >= .6 && profile.maxAccel <= 3.7);
    assert.ok(profile.brakeRate >= 1.2 && profile.brakeRate <= 3.6);
  }
});

test('noise can be switched off for reproducible comparisons', () => {
  const random = seededRandom(5);
  const exact = applyTraitNoise(profileAtFraction(.5), random, 0);
  assert.deepEqual(exact, profileAtFraction(.5));
});
