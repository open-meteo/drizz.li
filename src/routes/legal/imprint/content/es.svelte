<script lang="ts">
	import ProsePage from '$lib/components/prose-page.svelte';
</script>

<ProsePage title="Aviso legal" subtitle="Identificación del prestador del servicio.">
	<h2>Prestador del servicio</h2>
	<address>
		Vincent van der Wal<br />
		Tschalungasse 2<br />
		CH-6442 Gersau<br />
		Switzerland
	</address>
	<p>
		Correo electrónico: <a href="mailto:info@drizz.li">info@drizz.li</a>
	</p>

	<h2>Descargo de responsabilidad</h2>
	<p>
		Los datos meteorológicos de este sitio son solo informativos. Los pronósticos son
		intrínsecamente inciertos; no confíes en ellos cuando estén en juego la vida, la salud o los
		bienes: consulta los avisos oficiales de tu servicio meteorológico nacional.
	</p>
	<p>
		Los datos meteorológicos y geográficos proceden de
		<a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a>, que no está
		afiliado a este sitio. Los enlaces externos se ofrecen de buena fe; su contenido es
		responsabilidad de sus respectivos operadores.
	</p>
	<p class="text-muted-foreground">
		En caso de discrepancia prevalece la versión inglesa de este aviso legal.
	</p>
</ProsePage>
