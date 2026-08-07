// Ten scenarios spanning the parameter space deliberately rather than at random.
// They come in pairs around the rush-hour reference so that each pair isolates one
// dimension: demand, cycle length, speed, population, and participation.
//
// Each entry only lists what it changes; everything else comes from RUSH_HOUR.
// When a sweep varies the same parameter a scenario pins, the sweep wins for that
// axis, which is intended: it shows how the curve moves between scenarios.

export const SCENARIOS = [
  {
    key: 'rush-hour',
    label: 'Rush hour (reference)',
    note: 'The page defaults. Busy but not saturated, mixed drivers, partial compliance.',
    settings: {},
  },
  {
    key: 'quiet',
    label: 'Quiet street',
    note: 'Low demand. Both lanes can often clear their queue, so the advantage has little room to show.',
    settings: { arrivalRate: 5 },
  },
  {
    key: 'saturated',
    label: 'Saturated',
    note: 'Demand above what either lane can discharge, so throughput measures capacity rather than demand.',
    settings: { arrivalRate: 20 },
  },
  {
    key: 'short-cycle',
    label: 'Short cycle',
    note: 'A brief green. Only the front of the queue gets away each cycle.',
    settings: { greenPhase: 12 },
  },
  {
    key: 'long-cycle',
    label: 'Long cycle',
    note: 'A long green, as on a major junction. Queues have time to clear fully.',
    settings: { greenPhase: 45 },
  },
  {
    key: 'slow-street',
    label: 'Slow street (30 km/h)',
    note: 'Cars cannot convert a fast start into distance, so part of the benefit is stranded.',
    settings: { speedLimit: 30 },
  },
  {
    key: 'fast-road',
    label: 'Fast road (70 km/h)',
    note: 'Above the speed at which the advantage stopped growing in earlier sweeps.',
    settings: { speedLimit: 70 },
  },
  {
    key: 'low-compliance',
    label: 'Low compliance (30%)',
    note: 'A pessimistic rollout where only a minority of drivers take part.',
    settings: { stripeCompliance: 30 },
  },
  {
    key: 'cautious-population',
    label: 'Cautious population',
    note: 'Slow starters. In principle the group with most to gain from starting together.',
    settings: { aggressivenessMin: 1, aggressivenessMax: 2 },
  },
  {
    key: 'assertive-population',
    label: 'Assertive population',
    note: 'Quick starters who already follow closely, leaving less delay to recover.',
    settings: { aggressivenessMin: 4, aggressivenessMax: 5 },
  },
];
