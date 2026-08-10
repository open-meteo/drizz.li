<script lang="ts">
	import ProsePage from '$lib/components/prose-page.svelte';
</script>

<ProsePage title="Impressum" subtitle="Anbieterkennzeichnung.">
	<h2>Diensteanbieter</h2>
	<address>
		Vincent van der Wal<br />
		Tschalungasse 2<br />
		CH-6442 Gersau<br />
		Switzerland
	</address>
	<p>
		E-Mail: <a href="mailto:drizzli@vincentvanderwal.nl">drizzli@vincentvanderwal.nl</a>
	</p>
	<p>Drizz.li wird als persönliches, unabhängiges Projekt betrieben.</p>

	<h2>Haftungsausschluss</h2>
	<p>
		Die hier gezeigten Wetterdaten dienen ausschliesslich der allgemeinen Information. Vorhersagen
		sind naturgemäss unsicher; verlassen Sie sich nicht auf sie, wenn Leben, Gesundheit oder
		Sachwerte auf dem Spiel stehen - massgeblich sind die amtlichen Warnungen Ihres nationalen
		Wetterdienstes.
	</p>
	<p>
		Wetter- und Geodaten stammen von
		<a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a>, das nicht mit
		dieser Seite verbunden ist. Externe Links werden nach bestem Wissen gesetzt; für deren Inhalte
		sind die jeweiligen Betreiber verantwortlich.
	</p>
	<p class="text-muted-foreground">Massgeblich ist die englische Fassung dieses Impressums.</p>
</ProsePage>
