<script lang="ts">
	import ProsePage from '$lib/components/prose-page.svelte';
</script>

<ProsePage title="Imprint" subtitle="Legal notice / provider identification.">
	<h2>Service provider</h2>
	<address>
		Vincent van der Wal<br />
		Tschalungasse 2<br />
		CH-6442 Gersau<br />
		Switzerland
	</address>
	<p>
		Email: <a href="mailto:info@drizz.li">info@drizz.li</a>
	</p>

	<h2>Disclaimer</h2>
	<p>
		Weather data shown on this site is provided for general information only. Forecasts are
		inherently uncertain; do not rely on them where life, health or property is at stake - consult
		official warnings from your national weather service instead.
	</p>
	<p>
		Weather and geodata are retrieved from
		<a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a>, which is not
		affiliated with this site. External links are provided in good faith; their content is the
		responsibility of the respective operators.
	</p>
</ProsePage>
