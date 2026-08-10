<script lang="ts">
	import ProsePage from '$lib/components/prose-page.svelte';
</script>

<ProsePage title="About Drizz.li" subtitle="A small, open-source weather site.">
	<p>
		Drizz.li is part of the
		<a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a> project. It shows multi-model
		forecasts, model comparisons, 14-day outlooks, weather maps, seasonal outlooks and historical weather
		- without accounts, ads or trackers.
	</p>

	<h2>How it works</h2>
	<p>
		All weather data comes from the open-data APIs of Open-Meteo, which aggregate national weather
		services (DWD, NOAA, Météo-France, MeteoSwiss and more). Drizz.li is a static site: forecasts
		are fetched directly by your browser and rendered on your device.
	</p>
	<p>
		The site is open source. Anyone can read the code, report issues or contribute improvements on
		<a href="https://github.com/open-meteo/drizz.li" target="_blank" rel="noopener">GitHub</a>.
	</p>

	<h2>Contact</h2>
	<p>
		Questions, feedback or bug reports:
		<a href="mailto:drizzli@vincentvanderwal.nl">drizzli@vincentvanderwal.nl</a>
	</p>
</ProsePage>
