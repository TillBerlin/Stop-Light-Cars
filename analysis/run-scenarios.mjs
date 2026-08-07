// Runs every hypothesis sweep against every scenario and writes the results to disk.
//
//   node analysis/run-scenarios.mjs                 full run, ~35-40 minutes
//   node analysis/run-scenarios.mjs --runs 5        fewer runs per point, for a smoke test
//   node analysis/run-scenarios.mjs --scenario rush-hour
//   node analysis/run-scenarios.mjs --out results/my-run
//
// Progress goes to stderr so it can be followed with a tail while the run is in the
// background; results go to <out>.json and <out>.md. Nothing is printed to stdout
// except the final summary, so piping stays clean.

import fs from 'node:fs';
import path from 'node:path';
import { sweep, measure, RUSH_HOUR, DEFAULT_RUNS, DEFAULT_DURATION } from './harness.mjs';
import { SCENARIOS } from './scenarios.mjs';
import { HYPOTHESES } from './hypotheses.mjs';

function parseArguments(argv) {
  const options = { runs: DEFAULT_RUNS, duration: DEFAULT_DURATION, out: 'analysis/results/latest', scenario: null };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i], value = argv[i + 1];
    if (flag === '--runs') options.runs = Number(value);
    else if (flag === '--duration') options.duration = Number(value);
    else if (flag === '--out') options.out = value;
    else if (flag === '--scenario') options.scenario = value;
    else throw new Error(`unknown option ${flag}`);
  }
  return options;
}

const options = parseArguments(process.argv.slice(2));
const scenarios = options.scenario
  ? SCENARIOS.filter(s => s.key === options.scenario)
  : SCENARIOS;
if (scenarios.length === 0) {
  throw new Error(`no scenario named ${options.scenario}; known: ${SCENARIOS.map(s => s.key).join(', ')}`);
}

const totalSweeps = scenarios.length * HYPOTHESES.length;
const started = Date.now();
let done = 0;
const note = message => process.stderr.write(`${message}\n`);

note(`${scenarios.length} scenarios x ${HYPOTHESES.length} hypotheses = ${totalSweeps} sweeps`);
note(`${options.runs} runs per point, ${options.duration}s per run\n`);

const results = { meta: { runs: options.runs, duration: options.duration, generated: new Date().toISOString() }, scenarios: [] };

for (const scenario of scenarios) {
  const settings = { ...RUSH_HOUR, ...scenario.settings };
  note(`## ${scenario.key} - ${scenario.label}`);
  const baseline = measure(settings, options);
  note(`   baseline: A=${baseline.laneA.toFixed(1)} B=${baseline.laneB.toFixed(1)} `
    + `B/A=${baseline.ratio === null ? 'n/a' : baseline.ratio.toFixed(4)}`);

  const sweeps = {};
  for (const hypothesis of HYPOTHESES) {
    const points = sweep(hypothesis.axis, hypothesis.values, settings, options);
    sweeps[hypothesis.key] = points;
    done++;
    const best = points.filter(p => p.ratio !== null).reduce((m, p) => (p.ratio > m.ratio ? p : m), { ratio: -Infinity });
    const elapsed = (Date.now() - started) / 1000;
    const eta = elapsed / done * (totalSweeps - done);
    note(`   [${String(done).padStart(2)}/${totalSweeps}] ${hypothesis.key.padEnd(14)}`
      + ` peak B/A=${Number.isFinite(best.ratio) ? best.ratio.toFixed(4) : 'n/a'} at ${best.x}`
      + `   (eta ${Math.round(eta / 60)}m)`);
  }
  results.scenarios.push({ ...scenario, settings, baseline, sweeps });
}

function markdown(data) {
  const lines = [`# Scenario sweep results`, '',
    `${data.meta.runs} runs per point, ${data.meta.duration}s per run. Generated ${data.meta.generated}.`, '',
    `Every value is the mean over ${data.meta.runs} seeded runs. \`B/A\` is Lane B throughput divided by Lane A throughput; 1.00 means no advantage.`, ''];

  lines.push('## Baselines', '', '| Scenario | Lane A | Lane B | B/A | gain | wait A | wait B |', '|---|---|---|---|---|---|---|');
  for (const s of data.scenarios) {
    const b = s.baseline;
    lines.push(`| ${s.label} | ${b.laneA.toFixed(1)} | ${b.laneB.toFixed(1)} | ${b.ratio === null ? 'n/a' : b.ratio.toFixed(4)} `
      + `| ${b.ratio === null ? 'n/a' : `${((b.ratio - 1) * 100).toFixed(1)}%`} | ${b.waitA.toFixed(1)}s | ${b.waitB.toFixed(1)}s |`);
  }
  lines.push('');

  for (const hypothesis of HYPOTHESES) {
    lines.push(`## ${hypothesis.label}`, '', `Axis: \`${hypothesis.axis}\`. Each cell is the B/A throughput ratio.`, '');
    lines.push(`| Scenario | ${hypothesis.values.join(' | ')} |`);
    lines.push(`|---${'|---'.repeat(hypothesis.values.length)}|`);
    for (const s of data.scenarios) {
      const cells = s.sweeps[hypothesis.key].map(p => (p.ratio === null ? 'n/a' : p.ratio.toFixed(3)));
      lines.push(`| ${s.label} | ${cells.join(' | ')} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

const outPath = path.resolve(options.out);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(`${outPath}.json`, JSON.stringify(results, null, 1));
fs.writeFileSync(`${outPath}.md`, markdown(results));

const minutes = ((Date.now() - started) / 60000).toFixed(1);
note(`\ndone in ${minutes} minutes`);
process.stdout.write(`${outPath}.json\n${outPath}.md\n`);
