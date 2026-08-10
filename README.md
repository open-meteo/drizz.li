# <img src="static/favicon.svg" width="32" height="32" align="top" alt=""> Drizz.li

[![codecov](https://codecov.io/gh/open-meteo/drizz.li/graph/badge.svg?token=ONBCGBA8PU)](https://codecov.io/gh/open-meteo/drizz.li)
[![Tests & Build](https://github.com/open-meteo/drizz.li/actions/workflows/build.yml/badge.svg)](https://github.com/open-meteo/drizz.li/actions/workflows/build.yml)
[![GitHub licence](https://img.shields.io/github/license/open-meteo/drizz.li)](https://github.com/open-meteo/drizz.li/blob/main/LICENSE)

A high-performance weather forecast website, part of the
[Open-Meteo](https://open-meteo.com/) project. Built with SvelteKit and powered
by the Open-Meteo APIs.

The site ships as a fully static bundle: forecasts are fetched directly by the
visitor's browser and rendered on their device. No accounts, no ads, no
analytics or tracking scripts.

## Pages

| Route                            | What it shows                                                    |
| -------------------------------- | ---------------------------------------------------------------- |
| `/weather/week/[location]`       | 7-day forecast: daily cards, hourly table, meteograms            |
| `/weather/compare/[location]`    | The same forecast across models, side by side                    |
| `/weather/14-day/[location]`     | 14-day ensemble outlook                                          |
| `/weather/seasonal/[location]`   | Monthly outlook for the months ahead, against the climate normal |
| `/weather/historical/[location]` | Reanalysis archive back to 1940, with climate-normal comparison  |
| `/weather/maps/`                 | The Open-Meteo map viewer (`maps.open-meteo.com`) in an iframe   |

Locations come from Open-Meteo's geocoding API. A location is encoded in the
path either as a city slug or as a coordinate pair (`52.09N5.12E`).

## Tech stack

- **Framework**: [SvelteKit](https://kit.svelte.dev/) Svelte 5
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: Tailwind CSS 4 with [shadcn-svelte](https://shadcn-svelte.com/)
  components (`src/lib/components/ui`)
- **i18n**: [Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs)
  with the locale in the URL path (`en`, `de`, `es`, `fr`, `it`)
- **Data**: [Open-Meteo API](https://open-meteo.com/) through the `openmeteo`
  SDK, using the FlatBuffers transport rather than JSON
- **Visualization**: custom canvas charts (`src/lib/charts`)
- **Tests**: Vitest, with a browser project driven by Playwright

## Project structure

```
messages/            translated strings, one JSON file per locale (inlang)
project.inlang/      inlang project settings
scripts/             build-cities.mjs, regenerates static/data/cities
src/lib/charts/      canvas chart engine (CanvasChart.svelte + helpers)
src/lib/components/  shared UI, navigation, shadcn-svelte primitives
src/lib/services/    weather.ts - every Open-Meteo request goes through here
src/lib/stores/      persisted settings (location, model, units, theme, ...)
src/lib/utils/       date/location/URL helpers, maps domain mapping
src/routes/weather/  the forecast pages
static/data/cities/  GeoNames city tiles for the "nearby cities" section
```

## Developing

Install dependencies and start the dev server:

```sh
npm install
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

The dev and preview servers set `Cross-Origin-Opener-Policy` and
`Cross-Origin-Embedder-Policy` (see `vite.config.ts`), because the embedded map
needs the page to be cross-origin isolated. Production needs the same headers,
see below.

Other scripts:

```sh
npm run check      # svelte-check
npm run lint       # prettier --check + eslint
npm run format     # prettier --write
npm run test       # vitest, single run
```

### Translations

Strings live in `messages/<locale>.json` and are compiled into
`src/lib/paraglide/` (generated, gitignored) by the Paraglide Vite plugin.
Add a key to every locale file; `import * as m from '$lib/paraglide/messages'`
then exposes it as `m.your_key()`.

Long-form pages (about, imprint, privacy) are not message keys but one Svelte
file per locale under `src/routes/**/content/`.

### City data

`static/data/cities/` holds GeoNames towns cut into 10x10 degree tiles, which
is what the "nearby cities" section reads. Regenerate with:

```sh
node scripts/build-cities.mjs
```

## Building

```sh
npm run build
```

`npm run preview` serves the production build locally.

The build prerenders the static pages and the city pages listed in
`src/routes/weather/locations/city-names100.json` (base locale only, for every
per-location route). Everything else - unlisted cities, coordinate routes,
localized city pages - is served by the SPA fallback described below. A
transient geocoding failure skips that one page instead of failing the build.

## Releases

Releases are cut by [semantic-release](https://semantic-release.gitbook.io/)
from the conventional-commit messages on `main` (see `.releaserc`). The
[release workflow](.github/workflows/release.yml) runs nightly and on demand
via `workflow_dispatch`; it no-ops when nothing releasable has landed.

`fix:` bumps the patch, `feat:` bumps the minor, and `build(deps):` counts as a
patch so dependabot updates show up in the notes. While the project is in beta
the version stays in the `0.x` range: a breaking change is mapped to a minor
bump instead of a major one, so nothing can reach `1.0.0` by accident. Drop that
rule from `.releaserc` when the beta ends.

Each release writes the new version into `package.json` and `package-lock.json`
and pushes them back as a `chore(release): x.y.z [skip ci]` commit, so the
committed version, the git tag and the GitHub release always agree. The package
is `private`, so `@semantic-release/npm` only rewrites those files and never
publishes to the registry.

## Deployment (Cloudflare Pages)

The build output in `build/` is a fully static site.

Project settings:

| Setting                | Value           |
| ---------------------- | --------------- |
| Build command          | `npm run build` |
| Build output directory | `build`         |

Two pieces of configuration have to ride along in the deployment. Both are
plain files in `static/`, which the build copies into `build/`.

### 1. SPA fallback

Pages that are not prerendered (unlisted cities, GPS coordinate routes like
`/weather/week/52.09N5.12E/`) are served by `404.html`, which boots the app and
resolves the location client-side.

Cloudflare Pages serves `404.html` for unknown paths on its own, but with a 404
status: the page works, yet every hard reload of an unprerendered URL logs a 404
in the network panel and tells crawlers the page does not exist. A `_redirects`
file turns that into a 200 rewrite. Static assets still win over the rule, so
prerendered pages are unaffected:

```
# static/_redirects
/*  /404.html  200
```

### 2. Cross-origin isolation (SharedArrayBuffer for the embedded map)

The `/weather/maps/` page embeds `maps.open-meteo.com`, which uses
`SharedArrayBuffer` for its decoding worker pool. A cross-origin iframe only
gets `SharedArrayBuffer` when the **embedding** page is cross-origin isolated,
so this site must be served with:

```
# static/_headers
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```

(The map already serves `Cross-Origin-Resource-Policy: cross-origin` and its own
COOP/COEP, so it is embeddable under these headers. All other assets are
same-origin and the weather APIs are CORS requests, so `require-corp` is safe
here.)

## Licence

Drizz.li is open-source under the GNU Affero General Public Licence Version 3
(AGPLv3) or any later version. You can [find the licence here](LICENSE).
Exceptions are third party source-code with individual licensing in each file.
