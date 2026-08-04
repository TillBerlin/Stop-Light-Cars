# Green Wave Lab

An interactive traffic simulation showing how two queues respond to one traffic light. Drivers have individual driving profiles while both lanes share signal timing; Lane B uses a larger resting gap in the striped zone so lane throughput can be compared.

## Features

- Ten cars initially queue in each lane, with lengths sampled between 3.8 and 5.2 meters.
- Drivers have persistent `WAIT`, `STARTUP`, `DRIVE`, and `EMERGENCY BRAKE` behaviors. The labels describe driver intent instead of changing whenever instantaneous speed crosses a threshold.
- A waiting driver starts reacting on green after its leader moves at least 0.05 meters within 0.2 seconds or once the bumper gap reaches the fixed clearing distance. On red or orange, a gap of twice the clearing distance also starts the reaction, allowing a car to close an unusually large queue gap without proceeding through the signal.
- After the start-up countdown, the ordinary clearing distance must still be available. Otherwise the driver returns to `WAIT`. A driver remains stationary throughout `STARTUP`.
- While driving, each car continuously recalculates acceleration from its target speed, bumper gap, desired gap, and closing speed. The Driver mix control selects the minimum and maximum driver levels in the population.
- Ordinary pedal adjustments have no artificial reaction delay, but acceleration is smoothed by a 2 m/s³ jerk limit. A closing gap that predicts contact within one second is treated as a surprising hazard: the driver maintains the existing acceleration during a 0.5-second reaction interval, so a car already slowing continues to slow, and then builds toward the calculated collision-avoidance deceleration at the emergency 10 m/s³ jerk limit.
- Configurable green phases default to 20 seconds; each red phase lasts three seconds longer than the selected green phase. The phases repeat automatically with a one-second orange phase between them. Each driver independently stops for orange when there is enough braking distance or commits to crossing when stopping safely is no longer possible.
- New-car demand continues in each lane at the configured rate even when its entrance is blocked. Waiting arrivals appear in an upstream counter and enter as space becomes available, at a speed based on the leader and available stopping distance. The default is 10 cars per minute, and the arrival-rate slider ranges from 0 to 20 cars per minute in increments of 1.
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
- Requested acceleration follows an Intelligent Driver Model-style calculation using target speed, desired gap, and relative speed. Five profiles are available: Very cautious (level 1), Cautious (2), Normal (3), Assertive (4), and Aggressive (5). They progressively shorten start-up time and moving headway and increase ordinary jerk, maximum acceleration, and comfortable braking. Level 3 retains the original 1.85-second average start-up, 1.5-second headway, 2 m/s³ jerk, 2 m/s² acceleration, and 2.5 m/s² braking behavior. Tightening emergency braking always uses the vehicle-system limit of 10 m/s³ rather than a personality setting.
- The Driver mix range can create a homogeneous population by setting both bounds to one level, or a uniform mixture across any inclusive range. A car draws its level when its cached spawn profile is created and keeps that character throughout its run; changing the range during a run therefore affects only newly arriving cars, while restarting redraws the whole population.
- The desired moving gap includes the driver's profile headway above the normal safety gap. The continuous controller adds a closing-speed correction, while the headway disappears at rest. A compliant Lane B driver predicts its place in a forming red-light queue and latches the six-meter standstill gap before its stopping trajectory enters the striped zone. The six-meter gap applies while the queue is forming on red, including while the driver brakes, creeps, and waits. As soon as the light turns green and the queue begins dissolving, even a car that is still standing uses only the normal safety gap.
- Collision-risk braking begins when the bumper gap divided by closing speed predicts contact within one second. After the reaction interval, the required relative deceleration is calculated from the current closing speed and gap rather than selected from a fixed braking rate. The emergency state clears after time to contact rises above 1.5 seconds.
- Queue mode remains persistent while a car expects to stop within 50 meters of the line, but the lane-specific six-meter standstill gap is active only while that queue is forming on red. Cars can close available space on red but may not cross unless the signal permits it or they were already committed during orange.
- The lead car targets the legal stop position when it must stop; following cars target a safe queue position behind their leader.
- A stop is confirmed using both instantaneous speed and displacement over the previous 0.1 seconds. Within 0.15 meters of its target, a settled car is set to exactly zero speed and enters `WAIT` to avoid numerical crawling.
- Behavior transitions are retained in headless diagnostics with their reason and relevant motion context. Regression tests use this trace to ensure a car does not repeat its start-up sequence during the first green wave.
- Orange-light stopping decisions are made independently for every car, so a follower may stop even if the car ahead proceeds.

These rules are intended to produce an understandable educational visualization, not a calibrated traffic-engineering prediction.

The batch graph does not use a separate throughput approximation. Every graph point runs the same 50-millisecond arrival, signal, queueing, driver-behavior, and car-physics timestep as the visible simulation three times for two minutes, using seeded randomness so results are reproducible. The aggressiveness axis sets both population bounds to its selected level.
