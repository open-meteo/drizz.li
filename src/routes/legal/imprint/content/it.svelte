<script lang="ts">
	import ProsePage from '$lib/components/prose-page.svelte';
</script>

<ProsePage title="Note legali" subtitle="Identificazione del fornitore del servizio.">
	<h2>Fornitore del servizio</h2>
	<address>
		Vincent van der Wal<br />
		Tschalungasse 2<br />
		CH-6442 Gersau<br />
		Switzerland
	</address>
	<p>
		E-mail: <a href="mailto:drizzli@vincentvanderwal.nl">drizzli@vincentvanderwal.nl</a>
	</p>
	<p>Drizz.li è gestito come progetto personale e indipendente.</p>

	<h2>Avvertenza</h2>
	<p>
		I dati meteo mostrati su questo sito hanno finalità puramente informative. Le previsioni sono
		per natura incerte: non farvi affidamento quando sono in gioco la vita, la salute o i beni -
		consulta gli avvisi ufficiali del tuo servizio meteorologico nazionale.
	</p>
	<p>
		I dati meteo e geografici provengono da
		<a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a>, che non è
		affiliato a questo sito. I link esterni sono forniti in buona fede; i contenuti sono
		responsabilità dei rispettivi gestori.
	</p>
	<p class="text-muted-foreground">
		In caso di discrepanza prevale la versione inglese di queste note legali.
	</p>
</ProsePage>
