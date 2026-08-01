# Green Wave Lab

An interactive traffic simulation showing how two queues respond to one traffic light. Both lanes share start-up time, acceleration, clearing distance, and signal timing; each lane has its own resting gap so their throughput can be compared.

## Features

- Ten 5-meter cars initially queue in each lane.
- A queued car waits for its own start-up time and normally for the car ahead to start. On green, a bumper-to-bumper gap that meets the driver's clearing distance lets that driver react and start independently, so widely spaced queues can move together without skipping any driver's reaction time.
- Cars accelerate smoothly and brake to avoid the car ahead. On red, queued cars continue closing available space until they reach their lane's resting gap.
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
- Responsive, accessible, dependency-free static application.

## Run locally

No build step or dependencies are required. Start any static file server in the repository root:

```bash
python3 -m http.server 4173
```

Then visit <http://localhost:4173>.

## Deploy to GitHub Pages

The workflow in `.github/workflows/deploy.yml` deploys the repository as a static site whenever `main` is updated.

1. Create a public GitHub repository and push this project to its `main` branch.
2. Open **Settings → Pages** in the GitHub repository.
3. Under **Build and deployment**, choose **GitHub Actions** as the source.
4. Open the **Actions** tab and wait for **Deploy static site to Pages** to finish. You can also run it manually with **Run workflow**.
5. The deployment job and the repository's Pages settings show the public URL, normally `https://<username>.github.io/<repository>/`.

The Vite `base` option is set to `/Stop-Light-Cars/` in `vite.config.js`, matching this repository name so generated asset URLs work at the GitHub Pages project URL. If the repository is renamed, update that value to `/<new-repository-name>/` before deploying.
Because asset links are relative, the site works both at a user/organization root and beneath a project-repository path.

## Model assumptions

The simulation uses a simplified one-dimensional car-following model. Queue mode is persistent while a car expects to stop within 50 m of the line and uses the lane-specific standstill gap. It ends when the car is released on green. Outside queue mode, every driver uses Lane A's normal gap as the common base plus a speed-dependent safety distance, regardless of lane or stripe compliance. Cars may creep toward a stationary queue and use zero meters only as a hard non-overlap boundary. An orange-light decision is made independently for every car, so a follower stops whenever it can do so safely even if the car ahead proceeds. Moving cars accelerate up to the selected speed limit, brake predictively for signals and slower traffic, and brake harder when they get within four meters of a considerably slower car. This is an educational visualization rather than a traffic-engineering predictor.
