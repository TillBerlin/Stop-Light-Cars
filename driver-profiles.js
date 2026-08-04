export const DRIVER_LEVELS = Object.freeze([
  { level: 1, label: 'Very cautious', startup: 2.40, headway: 2.1, jerk: 1.0, maxAccel: 1.2, brakeRate: 2.00 },
  { level: 2, label: 'Cautious', startup: 2.10, headway: 1.8, jerk: 1.5, maxAccel: 1.6, brakeRate: 2.25 },
  { level: 3, label: 'Normal', startup: 1.85, headway: 1.5, jerk: 2.0, maxAccel: 2.0, brakeRate: 2.50 },
  { level: 4, label: 'Assertive', startup: 1.50, headway: 1.2, jerk: 3.0, maxAccel: 2.5, brakeRate: 2.75 },
  { level: 5, label: 'Aggressive', startup: 1.20, headway: .9, jerk: 4.0, maxAccel: 3.0, brakeRate: 3.00 },
]);

export function drawDriverLevel(min, max, random = Math.random) {
  if (min === max) return min;
  return Math.floor(random() * (max - min + 1)) + min;
}
