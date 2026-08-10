<script lang="ts">
	import ProsePage from '$lib/components/prose-page.svelte';
</script>

<ProsePage title="Über Drizz.li" subtitle="Eine kleine, quelloffene Wetterseite.">
	<p>
		Drizz.li ist Teil des Projekts
		<a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a>. Die Seite zeigt
		Vorhersagen mehrerer Modelle, Modellvergleiche, 14-Tage-Aussichten, Wetterkarten, saisonale
		Aussichten und historisches Wetter - ohne Konten, Werbung oder Tracker.
	</p>

	<h2>So funktioniert es</h2>
	<p>
		Alle Wetterdaten stammen aus den Open-Data-Schnittstellen von Open-Meteo, die nationale
		Wetterdienste bündeln (DWD, NOAA, Météo-France, MeteoSchweiz und weitere). Drizz.li ist eine
		statische Seite: Die Vorhersagen werden direkt von Ihrem Browser abgerufen und auf Ihrem Gerät
		dargestellt.
	</p>
	<p>
		Die Seite ist quelloffen. Jede und jeder kann den Code lesen, Fehler melden oder Verbesserungen
		auf
		<a href="https://github.com/open-meteo/drizz.li" target="_blank" rel="noopener">GitHub</a>
		beitragen.
	</p>

	<h2>Kontakt</h2>
	<p>
		Fragen, Rückmeldungen oder Fehlerberichte:
		<a href="mailto:drizzli@vincentvanderwal.nl">drizzli@vincentvanderwal.nl</a>
	</p>
</ProsePage>
