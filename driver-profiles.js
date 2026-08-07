// Driver personality is a continuous quantity, not five categories. The five named
// levels below are anchors on that scale: a driver draws a fraction in [0,1], its
// parameters are interpolated between the surrounding anchors, and a little noise is
// added so that no two drivers are numerically identical. Level 1 sits at fraction 0
// and level 5 at fraction 1, so the anchor values are still reproduced exactly and the
// published profile table remains accurate at those points.
export const DRIVER_LEVELS = Object.freeze([
  { level: 1, label: 'Very cautious', startup: 2.40, headway: 2.1, jerk: 1.0, maxAccel: 1.2, brakeRate: 2.00 },
  { level: 2, label: 'Cautious', startup: 2.10, headway: 1.8, jerk: 1.5, maxAccel: 1.6, brakeRate: 2.25 },
  { level: 3, label: 'Normal', startup: 1.85, headway: 1.5, jerk: 2.0, maxAccel: 2.0, brakeRate: 2.50 },
  { level: 4, label: 'Assertive', startup: 1.50, headway: 1.2, jerk: 3.0, maxAccel: 2.5, brakeRate: 2.75 },
  { level: 5, label: 'Aggressive', startup: 1.20, headway: .9, jerk: 4.0, maxAccel: 3.0, brakeRate: 3.00 },
]);

const TRAITS = ['startup', 'headway', 'jerk', 'maxAccel', 'brakeRate'];

// Relative standard deviation applied to each trait independently, once, when a car is
// created. Small enough that a cautious driver cannot out-accelerate an aggressive one,
// large enough that identical-looking drivers still behave slightly differently.
export const TRAIT_NOISE = .05;

// Physical floors, so an unlucky draw cannot produce a car that never gets moving or
// one that brakes implausibly gently.
const TRAIT_FLOORS = { startup: .6, headway: .4, jerk: .4, maxAccel: .6, brakeRate: 1.2 };

export function levelToFraction(level) {
  return (level - 1) / (DRIVER_LEVELS.length - 1);
}

export function fractionToLevel(fraction) {
  return 1 + fraction * (DRIVER_LEVELS.length - 1);
}

// Piecewise-linear interpolation through the anchors.
export function profileAtFraction(fraction) {
  const clamped = Math.min(1, Math.max(0, fraction));
  const scaled = clamped * (DRIVER_LEVELS.length - 1);
  const lowIndex = Math.min(Math.floor(scaled), DRIVER_LEVELS.length - 2);
  const weight = scaled - lowIndex;
  const low = DRIVER_LEVELS[lowIndex];
  const high = DRIVER_LEVELS[lowIndex + 1];
  const profile = { fraction: clamped, level: fractionToLevel(clamped) };
  for (const trait of TRAITS) profile[trait] = low[trait] + (high[trait] - low[trait]) * weight;
  return profile;
}

// Box-Muller. The tail is rejected rather than clamped: clamping would pile every
// extreme draw onto exactly +/-2 sigma, giving a population where several cars share
// an identical trait value, which is the artifact this noise exists to remove.
const NOISE_LIMIT = 2;

function gaussian(random) {
  for (let attempt = 0; attempt < 24; attempt++) {
    const first = Math.max(Number.EPSILON, random());
    const second = random();
    const value = Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
    if (Math.abs(value) <= NOISE_LIMIT) return value;
  }
  return 0;
}

export function applyTraitNoise(profile, random = Math.random, noise = TRAIT_NOISE) {
  const noisy = { ...profile };
  if (noise <= 0) return noisy;
  for (const trait of TRAITS) {
    const scaled = profile[trait] * (1 + gaussian(random) * noise);
    noisy[trait] = Math.max(TRAIT_FLOORS[trait], scaled);
  }
  return noisy;
}

// Draws one driver. `shape` selects how personalities are distributed between the
// bounds: 'uniform' spreads them evenly, while 'bimodal' places every driver at one
// bound or the other, producing a queue that alternates between cautious and assertive
// rather than blending them.
export function drawDriverProfile(minLevel, maxLevel, random = Math.random, options = {}) {
  const { shape = 'uniform', noise = TRAIT_NOISE } = options;
  const low = levelToFraction(Math.min(minLevel, maxLevel));
  const high = levelToFraction(Math.max(minLevel, maxLevel));
  let fraction;
  if (low === high) fraction = low;
  else if (shape === 'bimodal') fraction = random() < .5 ? low : high;
  else fraction = low + random() * (high - low);
  return applyTraitNoise(profileAtFraction(fraction), random, noise);
}
