// The claims the Findings section makes, expressed as sweeps so they can be re-tested
// against any scenario.
//
// The page's first finding — that Lane B moves roughly 30% more cars — is not a sweep;
// it is the scenario measured at its own settings, which run-scenarios.mjs records
// separately as that scenario's baseline.

export const HYPOTHESES = [
  {
    key: 'compliance',
    label: 'Compliance pays back steadily, with no threshold to clear',
    axis: 'stripeCompliance',
    values: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    claim: 'Monotonic in compliance, with a usable gain well below full participation.',
  },
  {
    key: 'zone-length',
    label: 'The striped zone needs about 40 metres and gains nothing after 50',
    axis: 'stripeLength',
    values: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    claim: 'Rises steeply to roughly 40m, then flat.',
  },
  {
    key: 'green-phase',
    label: 'Green phases stop mattering after about twelve seconds',
    axis: 'greenPhase',
    values: [10, 15, 20, 25, 30, 35, 40, 45, 50],
    claim: 'Rises out of the short-phase regime, then flat across the usable range.',
  },
  {
    key: 'speed-limit',
    label: 'Higher speed limits help, up to about 60 km/h',
    axis: 'speedLimit',
    values: [20, 30, 40, 50, 60, 70, 80, 90, 100],
    claim: 'Rises to roughly 60 km/h, then flat.',
  },
  {
    key: 'driver-style',
    label: 'Driver style barely changes the advantage',
    axis: 'aggressiveness',
    values: [1, 2, 3, 4, 5],
    claim: 'Relative advantage roughly flat, while absolute throughput changes greatly.',
  },
  {
    key: 'intended-distance',
    label: 'Six metres is the point past which extra distance is wasted',
    axis: 'bottomGap',
    values: [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8],
    claim: 'Rises to roughly 6m, then flat.',
  },
];
