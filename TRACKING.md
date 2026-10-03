# Analytics tracking

Sora uses the clavesa tracker: `public/tracker.js` (vendored unmodified
from `clavesa-dev/web-tracker/`) sends events as beacons to a 1x1 GIF, the
data rides in the query string, and CloudFront access logs are the
datastore. No cookies, no backend, no PII. The pattern and its invariants
are in `jeeves/practices/web-tracking.md`; this file covers only what Sora
does.

## Split hosting

The game deploys to GitHub Pages, which exposes no request logs, so the
pixel is served from our own CloudFront (Terraform under `infra/`, copied
from hoyry). The endpoint is an absolute cross-origin URL that
`TRACKER_CONFIG` in `index.html` takes from `VITE_PIXEL_URL` at build
time: a GitHub repository variable for the Pages deploy, `.env.local`
(written by `make env`) for builds on this machine. A clone or fork has
neither, so its build beacons nowhere. The tracker is also off on
localhost and for `?bot=1` screenshot runs.

Beacons go out with `navigator.sendBeacon` (POST). The distribution only
allows GET and HEAD, so beacons answer 403, which is fine: CloudFront logs
every request with its query string regardless of status, and the pipeline
reads only the query string.

## Standing it up

```sh
mise install       # the pinned Terraform
make plan          # terraform plan (infra/tfplan)
make apply         # S3 buckets + CloudFront; writes .env.local
gh variable set VITE_PIXEL_URL --body "$(AWS_PROFILE=personal terraform -chdir=infra output -raw pixel_url)"
make deploy-pixel  # upload public/t.gif with no-store
git push           # the Pages workflow builds with the variable
```

Done 2026-10-03. Logs land in `s3://sora-cloudfront-logs/cloudfront/`
with a 90-day lifecycle.

## Game events

`window.__clvtracker.track(event, data)` is the hook; the game calls it
through `track()` in `src/records.ts`. The Drive button on the title is a
`data-track="title-drive"` CTA. Two events a race, both sent from
`src/ui/Game.tsx`:

| Event | When | Data |
|-------|------|------|
| `race_start` | the race screen opens | `track`, `car` |
| `race_end` | the last lap is crossed | `track`, `car`, `best` lap, `total` time |

No rollup pipeline or board yet: that is on the roadmap, and it copies
Räkkä's `analytics/` and `StatsScreen`. The raw logs keep 90 days, so
nothing is lost by building it within that window.
