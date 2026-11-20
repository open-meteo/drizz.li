import { describe, expect, it } from 'vitest';

import { type GeoLocation, defaultLocation, requestTimezone } from './settings';

const gpsFix: GeoLocation = { ...defaultLocation, id: 0, feature_code: 'COORD', timezone: 'UTC' };

describe('requestTimezone', () => {
	it("follows the location's own zone by default", () => {
		expect(requestTimezone(defaultLocation, 'auto')).toBe('Europe/Berlin');
	});

	it('leaves the zone of a coordinate location to the API', () => {
		expect(requestTimezone(gpsFix, 'auto')).toBe('auto');
	});

	it('lets a zone picked in the settings win over either', () => {
		expect(requestTimezone(defaultLocation, 'America/New_York')).toBe('America/New_York');
		expect(requestTimezone(gpsFix, 'America/New_York')).toBe('America/New_York');
	});
});
