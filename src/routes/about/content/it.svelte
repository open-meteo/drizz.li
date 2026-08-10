<script lang="ts">
	import ProsePage from '$lib/components/prose-page.svelte';
</script>

<ProsePage title="Informazioni su Drizz.li" subtitle="Un piccolo sito meteo open source.">
	<p>
		Drizz.li fa parte del progetto
		<a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a>. Offre previsioni
		multi-modello, confronti tra modelli, tendenze a 14 giorni, mappe meteo, prospettive stagionali
		e dati storici, senza account, senza pubblicità e senza tracciatori.
	</p>

	<h2>Come funziona</h2>
	<p>
		Tutti i dati provengono dalle API aperte di Open-Meteo, che aggregano i servizi meteorologici
		nazionali (DWD, NOAA, Météo-France, MeteoSwiss e altri). Drizz.li è un sito statico: le
		previsioni vengono scaricate direttamente dal tuo browser e disegnate sul tuo dispositivo.
	</p>
	<p>
		Il sito è open source. Chiunque può leggere il codice, segnalare problemi o contribuire con
		miglioramenti su
		<a href="https://github.com/open-meteo/drizz.li" target="_blank" rel="noopener">GitHub</a>.
	</p>

	<h2>Contatti</h2>
	<p>
		Domande, riscontri o segnalazioni di bug:
		<a href="mailto:drizzli@vincentvanderwal.nl">drizzli@vincentvanderwal.nl</a>
	</p>
</ProsePage>
