# Green Wave Lab

An interactive, deterministic traffic simulation showing how two queues respond to one traffic light. Both lanes share reaction time, acceleration, safety distance, and signal timing; each lane has its own resting gap so their throughput can be compared.

## Features

- Ten 5-meter cars initially queue in each lane.
- Cars react to the green light and available safety distance, accelerate smoothly, and brake to avoid the car ahead.
- Equal, configurable red and green phases repeat automatically.
- New cars arrive from the right during red phases.
- Live crossed-car counts, throughput, phase countdown, and comparison.
- Play, pause, and restart controls.
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

Because asset links are relative, the site works both at a user/organization root and beneath a project-repository path.

## Model assumptions

The simulation uses a simplified one-dimensional car-following model. All drivers behave identically. A stopped driver begins reacting only when the signal is green and the clear distance ahead meets the selected safety distance. Moving cars accelerate up to 50 km/h and apply a fixed braking rate when approaching a red light or another car. This is an educational visualization rather than a traffic-engineering predictor.
