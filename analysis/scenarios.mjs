// Ten scenarios. Nine of them are saturated — demand above what a lane can discharge —
// because that is the regime the idea is meant for and the only one where a capacity
// difference can show at all. Lane A clears roughly 8 to 9 cars per minute at the
// reference settings, so anything from about 12 cars/min upward is saturated.
//
// `quiet-control` is the deliberate exception. It exists to demonstrate the saturation
// hypothesis: below capacity both lanes clear everything and the advantage vanishes,
// which is a property of the measurement rather than a failure of the idea.
//
// Each entry lists only what it changes; everything else comes from RUSH_HOUR.
// `runs` and `duration` may be overridden where a scenario needs a longer horizon.

export const SCENARIOS = [
  {
    key: 'rush-hour',
    label: 'Rush hour (reference)',
    note: 'The page defaults. Saturated, mixed drivers, partial compliance.',
    settings: {},
  },
  {
    key: 'heavy',
    label: 'Heavy congestion',
    note: 'Demand well beyond capacity, so throughput measures capacity alone.',
    settings: { arrivalRate: 20 },
  },
  {
    key: 'short-cycle',
    label: 'Short cycle (12s green)',
    note: 'Only the front of the queue gets away each cycle.',
    settings: { greenPhase: 12 },
  },
  {
    key: 'long-cycle',
    label: 'Long cycle (45s green)',
    note: 'A major junction. Queues have time to clear fully within a phase.',
    settings: { greenPhase: 45 },
  },
  {
    key: 'slow-street',
    label: 'Slow street (30 km/h)',
    note: 'Cars cannot convert a quick start into distance, stranding part of the gain.',
    settings: { speedLimit: 30 },
  },
  {
    key: 'low-compliance',
    label: 'Low compliance (30%)',
    note: 'A pessimistic rollout where only a minority of drivers take part.',
    settings: { stripeCompliance: 30 },
  },
  {
    key: 'homogeneous-drivers',
    label: 'Homogeneous drivers',
    note: 'Every driver near normal. Tests whether similar drivers coordinate better.',
    settings: { aggressivenessMin: 3, aggressivenessMax: 3 },
  },
  {
    key: 'alternating-drivers',
    label: 'Alternating cautious and aggressive',
    note: 'A bimodal population: every driver sits at one extreme or the other, so a '
      + 'cautious car is typically followed by an aggressive one.',
    settings: { aggressivenessMin: 1, aggressivenessMax: 5, driverMixShape: 'bimodal' },
  },
  {
    key: 'peak-and-ebb',
    label: 'Building and easing peak',
    note: 'Fifty minutes of varying demand: quiet at first, climbing to heavy congestion '
      + 'over thirty minutes, then easing back over twenty. Covers the approach to '
      + 'saturation and the recovery from it in a single run.',
    settings: {
      demandProfile: [
        { at: 0, rate: 4 },
        { at: 1800, rate: 20 },
        { at: 3000, rate: 4 },
      ],
    },
    // A fifty-minute horizon costs ten times a normal run, so it trades runs for length.
    runs: 6,
    duration: 3000,
  },
  {
    key: 'quiet-control',
    label: 'Quiet street (below capacity)',
    note: 'The one unsaturated scenario, included as a control. Both lanes clear nearly '
      + 'every car, so no advantage can appear however well the idea works.',
    settings: { arrivalRate: 5 },
  },
];
