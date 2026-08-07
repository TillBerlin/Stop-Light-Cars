# Green Wave Lab

An interactive traffic simulation showing how two queues respond to one traffic light. Drivers have individual driving profiles while both lanes share signal timing; Lane B uses a larger resting gap in the striped zone so lane throughput can be compared.

## Features

- Ten cars initially queue in each lane, with lengths sampled between 3.8 and 5.2 meters.
- Drivers have persistent `WAIT`, `STARTUP`, `DRIVE`, and `EMERGENCY BRAKE` behaviors. The labels describe driver intent instead of changing whenever instantaneous speed crosses a threshold.
- A waiting driver starts reacting on green after its leader moves at least 0.05 meters within 0.2 seconds or once the bumper gap reaches the fixed clearing distance. On red or orange, a gap of twice the clearing distance also starts the reaction, allowing a car to close an unusually large queue gap without proceeding through the signal.
- After the start-up countdown, the ordinary clearing distance must still be available. Otherwise the driver returns to `WAIT`. A driver remains stationary throughout `STARTUP`.
- While driving, each car continuously recalculates acceleration from its target speed, bumper gap, desired gap, and closing speed. The Driver mix control selects the minimum and maximum driver levels in the population.
- Ordinary pedal adjustments have no artificial reaction delay, but acceleration is smoothed by a 2 m/s³ jerk limit. A closing gap that predicts contact within one second is treated as a surprising hazard: the driver maintains the existing acceleration during a 0.5-second reaction interval, so a car already slowing continues to slow, and then builds toward the calculated collision-avoidance deceleration at the emergency 10 m/s³ jerk limit.
- Configurable green phases default to 20 seconds and range from 10 to 50 seconds; each red phase lasts three seconds longer than the selected green phase. The lower bound is 10 seconds because shorter phases discharge so few cars per cycle that integer quantisation dominates any measurement. The phases repeat automatically with a one-second orange phase between them. Each driver independently stops for orange when there is enough braking distance or commits to crossing when stopping safely is no longer possible.
- New cars arrive as a Poisson process: the arrival rate sets the expected number of cars per minute, and the intervals between them are exponentially distributed rather than fixed. A fixed cadence was unrealistic and could fall into step with the signal cycle, making throughput appear steadier than it is. Both lanes draw from the same arrival stream, so they always face identical demand and the comparison between them stays controlled. Demand continues even when a lane's entrance is blocked: waiting arrivals appear in an upstream counter and enter as space becomes available, at a speed based on the leader and available stopping distance. The default is 15 cars per minute, describing rush-hour demand, and the slider ranges from 0 to 20 cars per minute.
- The Lane B intended distance slider sets the standstill gap compliant drivers target in the striped zone, from 4 to 8 meters in 0.5-meter increments (default 6 meters). It is available both for the live visualization and as a batch statistics axis.
- Live crossed-car counts and phase countdown. Each visible run stops automatically at five minutes and keeps its final crossed-car totals on screen.
- Play, pause, and restart controls.
- Responsive, accessible static application built with Vite.

## Run locally

Install the development dependency and start Vite:

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite. To verify the production bundle locally, run `npm run build` followed by `npm run preview`.

## Deploy to GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds the Vite application and deploys the generated `dist` directory whenever a change is merged or pushed to `main`. The workflow can also be started manually.

1. Create a public GitHub repository and push this project to its `main` branch.
2. Open **Settings → Pages** in the GitHub repository.
3. Under **Build and deployment**, choose **GitHub Actions** as the source.
4. Open the **Actions** tab and wait for **Deploy static site to Pages** to finish. You can also run it manually with **Run workflow**.
5. The deployment job and the repository's Pages settings show the public URL, normally `https://<username>.github.io/<repository>/`.

The Vite `base` option is set to `/Stop-Light-Cars/` in `vite.config.js`, matching this repository name so generated asset URLs work at the GitHub Pages project URL. If the repository is renamed, update that value to `/<new-repository-name>/` before deploying.

## Model assumptions

The simulation uses a simplified one-dimensional car-following model:

- Each car stores its behavioral state separately from its instantaneous speed. `DRIVE` includes acceleration, constant-speed travel, coasting, gentle braking, and low-speed queue closing; emergency braking is also exposed as a visible state.
- Start-up time and braking reaction time represent different effects. A stopped driver completes the configured start-up countdown before moving. Ordinary speed-and-gap corrections occur continuously without delay. A separate 0.5-second reaction interval applies only when the current gap and closing speed predict contact within one second; during that interval the existing acceleration remains in effect.
- Requested acceleration follows an Intelligent Driver Model-style calculation using target speed, desired gap, and relative speed. Driver personality is continuous rather than categorical. Five named levels act as anchors on that scale: Very cautious (1), Cautious (2), Normal (3), Assertive (4), and Aggressive (5), progressively shortening start-up time and moving headway while increasing ordinary jerk, maximum acceleration, and comfortable braking. Level 3 retains the original 1.85-second start-up, 1.5-second headway, 2 m/s³ jerk, 2 m/s² acceleration, and 2.5 m/s² braking. A driver may sit anywhere between two anchors, with every trait interpolated linearly. Tightening emergency braking always uses the vehicle-system limit of 10 m/s³ rather than a personality setting.
- The Driver mix range spreads drivers continuously across the selected span, defaulting to levels 2 through 4 so an ordinary population contains cautious, normal, and assertive temperaments rather than one. Each trait additionally receives an independent random nudge of about five percent, applied once when the car is created. Two consequences follow: no two drivers are numerically identical even when both bounds are set to the same level, and a car's whole personality is fixed at spawn rather than resampled while it drives. The former start-up jitter is gone, since the continuous draw and the trait noise now supply that variation. Changing the range during a run affects only newly arriving cars, while restarting redraws the whole population.
- The desired moving gap includes the driver's profile headway above the normal safety gap. The continuous controller adds a closing-speed correction, while the headway disappears at rest. A compliant Lane B driver predicts its place in a forming red-light queue and latches the configured standstill gap (the Lane B intended distance slider, 4 to 8 meters, default 6) before its stopping trajectory enters the striped zone. That gap applies while the queue is forming on red, including while the driver brakes, creeps, and waits. As soon as the light turns green and the queue begins dissolving, even a car that is still standing uses only the normal safety gap.
- Collision-risk braking begins when the bumper gap divided by closing speed predicts contact within one second. After the reaction interval, the required relative deceleration is calculated from the current closing speed and gap rather than selected from a fixed braking rate. The emergency state clears after time to contact rises above 1.5 seconds.
- Queue mode remains persistent while a car expects to stop within 50 meters of the line, but the lane-specific standstill gap is active only while that queue is forming on red. Cars can close available space on red but may not cross unless the signal permits it or they were already committed during orange.
- The lead car targets the legal stop position when it must stop; following cars target a safe queue position behind their leader.
- A stop is confirmed using both instantaneous speed and displacement over the previous 0.1 seconds. Within 0.15 meters of its target, a settled car is set to exactly zero speed and enters `WAIT` to avoid numerical crawling.
- Behavior transitions are retained in headless diagnostics with their reason and relevant motion context. Regression tests use this trace to ensure a car does not repeat its start-up sequence during the first green wave.
- Orange-light stopping decisions are made independently for every car, so a follower may stop even if the car ahead proceeds.

These rules are intended to produce an understandable educational visualization, not a calibrated traffic-engineering prediction.

The statistics panel can sweep green phase, compliance, striped zone length, Lane B intended distance, arrival rate, speed limit (20 to 100 km/h in steps of 10), and driver aggressiveness.

The Results section reports nine findings, each tested across ten scenarios rather than one, with a chart per finding showing every scenario at once. Nine scenarios are saturated (demand above what a lane can discharge); the tenth is quiet as a control. The reference scenario, which is also the page's opening state, is a 20-second green, 15 cars per minute, 70 percent compliance, a 50-metre striped zone, a 6-metre intended distance, a 50 km/h limit, and a population spanning driver levels 2 to 4. Points average 20 seeded runs of five minutes.

Lane B moves about 30 percent more cars in that scenario, ranging from +15 to +34 percent across the saturated scenarios. Nothing happens below saturation, since both lanes clear everything. Compliance pays back proportionally with no threshold. The striped zone needs roughly 40 metres, intended distances above about 4.5 metres add nothing, higher speed limits help up to about 60 km/h, and short green phases suit the idea better than long ones. Two results were surprising: only a uniformly aggressive population gains noticeably less, and dissimilar drivers make the method *more* effective rather than less, because irregular traffic penalises the tightly packed lane more than the spaced one.

The analysis harness that produces these numbers lives in `analysis/`, along with a written record of the measurement pitfalls. Read `analysis/README.md` before interpreting any sweep.

The batch graph does not use a separate throughput approximation. Every graph point runs the same 50-millisecond arrival, signal, queueing, driver-behavior, and car-physics timestep as the visible simulation three times for two minutes, using seeded randomness so results are reproducible. The aggressiveness axis sets both population bounds to its selected level.
