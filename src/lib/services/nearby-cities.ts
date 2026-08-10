/**
 * Picks a handful of cities around a location, for cross-referencing a forecast
 * against places you already have a feel for.
 *
 * Open-Meteo's geocoding API can only search by name - there is no radius or
 * reverse lookup - so the candidates come from a static GeoNames extract, cut
 * into 10x10 degree tiles (see scripts/build-cities.mjs). Looking somewhere up
 * costs one small tile fetch, which the browser then caches.
 */
import { base } from '$app/paths';

/** [geonames id, name, country code, latitude, longitude, population/1000] */
type CityRow = [number, string, string, number, number, number];

export interface NearbyCity {
	id: number;
	name: string;
	countryCode: string;
	latitude: number;
	longitude: number;
	population: number;
	distanceKm: number;
}

const EARTH_RADIUS_KM = 6371;
const TILE_DEGREES = 10;

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const toRad = Math.PI / 180;
	const dLat = (lat2 - lat1) * toRad;
	const dLon = (lon2 - lon1) * toRad;
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
	return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

function tileKey(latitude: number, longitude: number): string {
	const lat = Math.min(89.999, Math.max(-90, latitude));
	const lon = ((((longitude + 180) % 360) + 360) % 360) - 180;
	return `${Math.floor((lat + 90) / TILE_DEGREES)}_${Math.floor((lon + 180) / TILE_DEGREES)}`;
}

const tileCache = new Map<string, Promise<CityRow[]>>();
let indexPromise: Promise<Set<string>> | null = null;

async function fetchJson<T>(path: string): Promise<T> {
	const res = await fetch(`${base}/data/cities/${path}`);
	if (!res.ok) throw new Error(`${path}: ${res.status}`);
	return res.json() as Promise<T>;
}

/** Tiles exist only where there are cities, so the index turns an empty ocean
 * tile into a no-op instead of a 404. */
function loadIndex(): Promise<Set<string>> {
	indexPromise ??= fetchJson<string[]>('index.json')
		.then((keys) => new Set(keys))
		.catch((err) => {
			indexPromise = null;
			throw err;
		});
	return indexPromise;
}

async function loadTile(key: string): Promise<CityRow[]> {
	if (!(await loadIndex()).has(key)) return [];

	let tile = tileCache.get(key);
	if (!tile) {
		tile = fetchJson<CityRow[]>(`${key}.json`).catch((err) => {
			// a failed fetch must not poison the cache: the next visit retries
			tileCache.delete(key);
			throw err;
		});
		tileCache.set(key, tile);
	}
	return tile;
}

/**
 * Widening rings. Within 400 km the tile holds towns down to 20k; past that
 * only cities above 300k, which is exactly the bias a wide search wants - if
 * nothing is nearby, the answer should be a place people have heard of.
 */
const SEARCH_RADII_KM = [200, 400, 1500];

/**
 * How far out still counts as "the place you are already looking at". A village
 * ends where its fields start; London's own boroughs sit 20 km from its centre
 * and share its weather, so the radius grows with the size of the location.
 */
function samePlaceKm(population: number): number {
	return 10 + 15 * Math.min(1, population / 5_000_000);
}

/**
 * Returns up to `count` cities around the given point, ordered by distance.
 *
 * Candidates are ranked by population damped by distance, so a town up the
 * valley can outrank a metropolis three hours away, and picks have to keep
 * their distance from each other - otherwise a place like New York fills the
 * list with its own boroughs, and a big city fills it with commuter suburbs
 * that share its weather anyway.
 */
export async function findNearbyCities(
	latitude: number,
	longitude: number,
	count = 10,
	population = 0
): Promise<NearbyCity[]> {
	const rows = await loadTile(tileKey(latitude, longitude));
	if (rows.length === 0) return [];

	const ownFootprintKm = samePlaceKm(population);

	let best: NearbyCity[] = [];

	for (const radius of SEARCH_RADII_KM) {
		const halfWeightKm = radius / 2;
		// far-apart picks in a wide search, tight ones when everything is close
		const minSeparationKm = Math.max(25, radius / 20);

		const scored = rows
			.map(([id, name, countryCode, lat, lon, popK]) => {
				const dist = distanceKm(latitude, longitude, lat, lon);
				return {
					city: {
						id,
						name,
						countryCode,
						latitude: lat,
						longitude: lon,
						population: popK * 1000,
						distanceKm: dist
					},
					score: popK / (1 + (dist / halfWeightKm) ** 2)
				};
			})
			.filter(({ city }) => city.distanceKm >= ownFootprintKm && city.distanceKm <= radius)
			.sort((a, b) => b.score - a.score);

		const picked: NearbyCity[] = [];
		for (const { city } of scored) {
			if (picked.length === count) break;
			const tooClose = picked.some(
				(p) => distanceKm(p.latitude, p.longitude, city.latitude, city.longitude) < minSeparationKm
			);
			if (!tooClose) picked.push(city);
		}

		if (picked.length >= count) return picked.sort((a, b) => a.distanceKm - b.distanceKm);
		if (picked.length > best.length) best = picked;
	}

	return best.sort((a, b) => a.distanceKm - b.distanceKm);
}
