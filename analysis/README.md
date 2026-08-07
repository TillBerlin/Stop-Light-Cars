# Analysis harness

Tooling for running parameter sweeps against the simulation, and the measurement
pitfalls that make naive readings wrong. **Read the pitfalls before interpreting any
number this produces** — every one of them has already caused a wrong conclusion that
had to be retracted.

## Running

```bash
node analysis/run-scenarios.mjs                          # all scenarios, ~35-40 min
node analysis/run-scenarios.mjs --runs 3 --duration 60   # quick smoke test
node analysis/run-scenarios.mjs --scenario saturated     # one scenario
node analysis/run-scenarios.mjs --out analysis/results/2026-08-07
```

Progress goes to stderr, so a long run can be followed with a tail. Results are written
to `<out>.json` and `<out>.md`. A full run is long enough that it should go in the
background rather than being waited on.

| File | Purpose |
|---|---|
| `fake-dom.mjs` | Minimal fake `document`, so `app.js` can be imported in Node. Also used by `simulation.test.js`. |
| `harness.mjs` | Boots the engine, exposes `sweep()`, `measure()` and the `RUSH_HOUR` reference scenario. |
| `scenarios.mjs` | The ten scenarios. |
| `hypotheses.mjs` | The claims from the page's Findings section, as sweeps. |
| `run-scenarios.mjs` | Runs every hypothesis against every scenario, writes JSON + markdown. |
| `make-charts.mjs` | Turns a results file into the inline SVG charts in the Findings section. |

Rebuilding the page's charts after a run:

```bash
node analysis/make-charts.mjs analysis/results/full.json
```

Charts draw every scenario as a faint line with the rush-hour reference on top, so a
reader can see whether a finding holds generally or only around one operating point.
The placeholders it fills are `<!--CHART:key-->` comments in `index.html`, which means
the charts can only be regenerated from a clean copy of those placeholders — check the
Findings section back out before re-running it.

## Two derived axes

Most sweeps set a settings key directly. Two do not:

- `aggressiveness` builds a uniform population at exactly that level, matching the
  page's own axis.
- `driverMixWidth` varies how wide a spread of personalities exists, centred on normal.
  Width 0 is a population of identical drivers and width 4 spans the full range. Driver
  level is continuous, so half-level bounds are meaningful.

Scenarios may also set `driverMixShape: 'bimodal'`, which places every driver at one
bound or the other rather than spreading them, and `demandProfile`, a list of
`{at, rate}` points that ramps traffic over the run. Neither has a slider; both exist
only for analysis, and both are declared in the engine's defaults so a batch run
restores them cleanly afterwards.

## Why the fake DOM exists

`app.js` is browser code and touches the DOM at import time — it builds its sliders and
attaches listeners as a side effect of loading. A bare `import('./app.js')` in Node
therefore fails with `document is not defined` before any function can be called.
`installFakeBrowser()` must run first. The fake only needs to be good enough for that
module-level setup; the one subtle part is the `innerHTML` setter, which has to
materialise `<input>` elements because `app.js` writes slider markup and then reads the
inputs back out.

## Nothing here approximates the model

Every data point calls `runStatisticsSimulation`, the same entry point the page's batch
graph uses, which runs the same 50ms timestep as the visible simulation. There is no
separate faster model that could drift from the real one. Sweeps use common random
numbers — each x value sees the same sequence of run seeds — so adjacent points differ
because of the parameter rather than because of luck.

## Pitfalls

### Throughput is quantised

Each signal cycle discharges a whole number of cars, so the ratio tends toward a ratio of
small integers: 8/6, 7/5, 6/4. **Differences below roughly 5% are not resolvable**, and a
"peak" one step above its neighbours usually is not real. Fewer cars per cycle means
coarser quantisation, which is why the green-phase axis starts at 10s.

Poisson arrivals loosened this considerably — demand no longer falls into step with the
signal, so Lane A throughput varies across seeds instead of landing on the identical
integer every time. It did not remove the effect, because a cycle still discharges whole
cars. Averaging over more runs helps; reading a single point does not.

### The demand ceiling

If the arrival rate is low, a lane can clear nearly every car that exists. Its throughput
then measures *demand*, not capacity, and the ratio collapses toward 1.00 for reasons
that have nothing to do with the idea being tested.

This has already produced one wrong conclusion: at 10 cars/min with an all-aggressive
population, both lanes cleared everything, the ratio read exactly 1.00, and it looked
like aggressive drivers gained nothing from the larger gap. They were simply both at the
ceiling. **Before concluding that an effect vanishes, check whether Lane B is near total
demand** (roughly `arrivalRate x minutes + 10` initial cars). The `quiet` scenario exists
to show this deliberately; treat its flat results as an artifact, not a finding.

### One parameter at a time, around one scenario

Sweeps vary a single axis around a fixed scenario, and the parameters interact. An
earlier version of the Findings section reported a sweet spot near a 15-second green
phase; that was an artifact of an all-normal population at lower demand and disappeared
entirely once the population was mixed. Conclusions hold "around this scenario" and not
in general, which is what the ten scenarios are for.

### The striped-zone boundary case

A compliant driver latches the larger resting gap from its *predicted* queue slot. Near
the far edge of the striped zone that prediction can fall outside the zone, after which
the queue compacts and the car comes to rest just inside it on the ordinary 2m gap.

Measured at roughly 2 stops in 59 across 8 seeds, all within 1.5m of the boundary. It is
deliberately not "fixed": by the time the car has arrived, latching cannot create space,
so a real fix means changing the prediction rule — a model design decision, not a bug
fix. `simulation.test.js` allows it only within 2m of the boundary and fails if it
spreads deeper into the zone.

### Aborted start-ups are legitimate

In a mixed population a cautious leader can pull away too slowly for its follower to
keep its clearing distance, so the follower returns to `WAIT` and repeats its countdown.
This is documented behaviour, not a defect, and runs at roughly 3.3 events per
five-minute run. The regression tests that assert a car starts up exactly once are
therefore pinned to a uniform normal population.

## Interpreting output

`B/A` is Lane B throughput divided by Lane A throughput; `1.00` means no advantage. Both
lanes see identical demand, signal timing and driver populations, so the ratio isolates
the resting-gap rule. Waiting time is measured from a car's spawn until it crosses the
stop line, and is often the more sensitive of the two measures, since it moves
continuously where throughput moves in whole cars.
