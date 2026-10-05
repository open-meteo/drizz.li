import * as m from '$lib/paraglide/messages';

import { TRACE_COLORS } from './renderer';

/** Shared labels and samples for the on-screen legend and PNG exports. */
export function soundingLegend() {
	return {
		lines: [
			{ name: m.var_temperature(), color: TRACE_COLORS.temperature, style: 'solid' },
			{ name: m.var_dew_point(), color: TRACE_COLORS.dewpoint, style: 'solid' },
			{ name: m.sounding_parcel_temperature(), color: 'var(--foreground)', style: 'dashed' },
			{ name: m.sounding_dry(), color: TRACE_COLORS.dry, style: 'dashed' },
			{ name: m.sounding_moist(), color: TRACE_COLORS.moist, style: 'solid' },
			{ name: m.sounding_mixing(), color: TRACE_COLORS.mixing, style: 'dotted' }
		] as const,
		areas: [
			{ key: 'cape', name: 'CAPE', color: TRACE_COLORS.cape, style: 'area' },
			{ key: 'cin', name: 'CIN', color: TRACE_COLORS.cin, style: 'area' },
			{
				key: 'subcloud',
				name: m.sounding_subcloud_buoyancy(),
				color: TRACE_COLORS.subcloud,
				style: 'area'
			},
			{
				key: 'cloud',
				name: m.sounding_cloud_shading(),
				color: 'var(--muted-foreground)',
				style: 'area'
			}
		] as const
	};
}
