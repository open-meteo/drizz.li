/**
 * Regenerates static/data/cities/ - the city lists the "nearby cities" section
 * on the week page picks from.
 *
 * Source: GeoNames (CC BY 4.0) via the cities500 mirror.
 *
 * The full list of towns down to 20k inhabitants is ~1 MB, far too much to ship
 * to a phone for one section, so it is cut into 10x10 degree tiles. A tile
 * holds every town within NEAR_RADIUS_KM of anywhere inside it, plus the larger
 * cities within FAR_RADIUS_KM - so one small fetch answers both "what is around
 * the corner" and "what is the nearest place you would recognise" (which is all
 * a location in, say, the Australian outback can offer). Tiles overlap by
 * design; duplicating a few rows is cheaper than a second round trip.
 *
 * The ids are GeoNames ids, which is what Open-Meteo's geocoding API returns,
 * so a row can be turned into a location route without another lookup.
 *
 * Run with: node scripts/build-cities.mjs
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = 'https://raw.githubusercontent.com/lmfmaier/cities-json/master/cities500.json';

const MIN_POPULATION = 20_000;
/** every city of any size within this range of the tile */
const NEAR_RADIUS_KM = 400;
/** only cities above FAR_MIN_POPULATION out to here */
const FAR_RADIUS_KM = 1500;
const FAR_MIN_POPULATION = 300_000;
const TILE_DEGREES = 10;

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'data', 'cities');

// CITIES_SOURCE_FILE lets you build from an already-downloaded copy, which is
// also the only way to run this behind a proxy that node doesn't pick up.
const localSource = process.env.CITIES_SOURCE_FILE;
const source = localSource
	? JSON.parse(await readFile(localSource, 'utf8'))
	: await fetch(SOURCE).then((res) => {
			if (!res.ok) throw new Error(`source fetch failed: ${res.status}`);
			return res.json();
		});

const cities = source
	.map((c) => ({
		id: Number(c.id),
		name: c.name,
		country: c.country,
		lat: Number(c.lat),
		lon: Number(c.lon),
		pop: Number(c.pop ?? 0)
	}))
	.filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon) && c.pop >= MIN_POPULATION)
	// biggest first, so a tile that gets truncated keeps the recognisable names
	.sort((a, b) => b.pop - a.pop);

const toRad = Math.PI / 180;

/** Distance from a point to the nearest point of a lat/lon rectangle. */
function distanceToTileKm(lat, lon, latMin, latMax, lonMin, lonMax) {
	const clampedLat = Math.min(latMax, Math.max(latMin, lat));
	// longitude distance shrinks towards the poles, measured at the closest latitude
	let dLon = 0;
	if (lon < lonMin) dLon = lonMin - lon;
	else if (lon > lonMax) dLon = lon - lonMax;
	if (dLon > 180) dLon = 360 - dLon;

	const dLat = Math.abs(clampedLat - lat);
	const lonKm = dLon * 111.32 * Math.cos(clampedLat * toRad);
	return Math.hypot(dLat * 111.32, lonKm);
}

const tiles = new Map();
for (let latIndex = 0; latIndex < 180 / TILE_DEGREES; latIndex++) {
	for (let lonIndex = 0; lonIndex < 360 / TILE_DEGREES; lonIndex++) {
		const latMin = -90 + latIndex * TILE_DEGREES;
		const lonMin = -180 + lonIndex * TILE_DEGREES;
		const bounds = [latMin, latMin + TILE_DEGREES, lonMin, lonMin + TILE_DEGREES];

		const rows = [];
		for (const c of cities) {
			const dist = distanceToTileKm(c.lat, c.lon, ...bounds);
			const inRange =
				dist <= NEAR_RADIUS_KM || (c.pop >= FAR_MIN_POPULATION && dist <= FAR_RADIUS_KM);
			if (!inRange) continue;
			// tuples, not objects: same data, roughly half the bytes
			rows.push([
				c.id,
				c.name,
				c.country,
				+c.lat.toFixed(3),
				+c.lon.toFixed(3),
				Math.round(c.pop / 1000)
			]);
		}
		if (rows.length > 0) tiles.set(`${latIndex}_${lonIndex}`, rows);
	}
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

let bytes = 0;
for (const [key, rows] of tiles) {
	const json = JSON.stringify(rows);
	bytes += json.length;
	await writeFile(join(outDir, `${key}.json`), json, 'utf8');
}
// the index tells the client which tiles exist, so an empty ocean tile is a
// no-op instead of a 404
await writeFile(join(outDir, 'index.json'), JSON.stringify([...tiles.keys()]), 'utf8');

const largest = Math.max(...[...tiles.values()].map((r) => r.length));
console.log(
	`wrote ${tiles.size} tiles (${(bytes / 1024 / 1024).toFixed(1)} MB total, ` +
		`avg ${Math.round(bytes / tiles.size / 1024)} KB, largest ${largest} cities) to ${outDir}`
);
