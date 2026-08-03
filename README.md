# Green Wave Lab

An interactive traffic simulation showing how two queues respond to one traffic light. Both lanes share start-up time, acceleration, clearing distance, and signal timing; each lane has its own resting gap so their throughput can be compared.

## Features

- Ten cars initially queue in each lane, with lengths sampled between 3.8 and 5.2 meters.
- Drivers have persistent `WAIT`, `STARTUP`, `DRIVE`, and `EMERGENCY BRAKE` behaviors. The labels describe driver intent instead of changing whenever instantaneous speed crosses a threshold.
- A waiting driver starts reacting on green after its leader moves at least 0.05 meters within 0.2 seconds or once the bumper gap reaches the configured clearing distance. On red or orange, a gap of twice the clearing distance also starts the reaction, allowing a car to close an unusually large queue gap without proceeding through the signal.
- After the start-up countdown, the ordinary clearing distance must still be available. Otherwise the driver returns to `WAIT`. A driver remains stationary throughout `STARTUP`.
- While driving, cars transition after a per-driver reaction time between accelerating, holding speed, coasting, gentle braking, low-speed queue closing, and emergency braking. Desired-gap and time-to-contact hysteresis keep small numerical changes from repeatedly reversing a decision.
- Equal, configurable red and green phases repeat automatically, separated by a one-second orange phase. Each driver independently stops for orange when there is enough braking distance or commits to crossing when stopping safely is no longer possible.
- New-car demand continues in each lane at the configured rate even when its entrance is blocked. Waiting arrivals appear in an upstream counter and enter as space becomes available, at a speed based on the leader and available stopping distance. The default is 30 cars per minute, and the arrival-rate slider ranges from 10 to 60 cars per minute in increments of 5.
- Live crossed-car counts and phase countdown.
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
- Reaction time is stored per driver and currently initialized to 0.5 simulation seconds for every driver. A stronger pending reaction supersedes a weaker one, so a previously scheduled gentle action cannot overwrite emergency braking.
- The moving safety distance includes the applicable final gap, distance closed on the leader during reaction time, and the extra braking distance required when the follower is faster. A compliant Lane B driver predicts its place in a forming queue and latches the six-meter gap before its stopping trajectory enters the striped zone. It retains that gap while braking, creeping, and waiting, then returns to the normal moving gap after release on green.
- Emergency braking begins at 1.2 seconds time to contact and uses a 2-second exit threshold. The different thresholds provide hysteresis. A very short gap can also trigger it independently of time to contact.
- Queue mode is persistent while a car expects to stop within 50 meters of the line and uses the lane-specific standstill gap. Cars can close available space on red but may not cross unless the signal permits it or they were already committed during orange.
- The lead car targets the legal stop position when it must stop; following cars target a safe queue position behind their leader.
- A stop is confirmed using both instantaneous speed and displacement over the previous 0.1 seconds. Within 0.15 meters of its target, a settled car is set to exactly zero speed and enters `WAIT` to avoid numerical crawling.
- Orange-light stopping decisions are made independently for every car, so a follower may stop even if the car ahead proceeds.

These rules are intended to produce an understandable educational visualization, not a calibrated traffic-engineering prediction.
