<script lang="ts">
	import ProsePage from '$lib/components/prose-page.svelte';
</script>

<ProsePage title="Sobre Drizz.li" subtitle="Un pequeño sitio meteorológico de código abierto.">
	<p>
		Drizz.li forma parte del proyecto
		<a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a>. Muestra
		pronósticos de varios modelos, comparaciones entre modelos, previsiones a 14 días, mapas
		meteorológicos, perspectivas estacionales y datos históricos, sin cuentas, sin anuncios y sin
		rastreadores.
	</p>

	<h2>Cómo funciona</h2>
	<p>
		Todos los datos proceden de las API de datos abiertos de Open-Meteo, que agregan los servicios
		meteorológicos nacionales (DWD, NOAA, Météo-France, MeteoSwiss y más). Drizz.li es un sitio
		estático: tu navegador descarga los pronósticos directamente y los representa en tu dispositivo.
	</p>
	<p>
		El sitio es de código abierto. Cualquiera puede leer el código, informar de errores o contribuir
		con mejoras en
		<a href="https://github.com/open-meteo/drizz.li" target="_blank" rel="noopener">GitHub</a>.
	</p>

	<h2>Contacto</h2>
	<p>
		Dudas, comentarios o informes de errores:
		<a href="mailto:info@drizz.li">info@drizz.li</a>
	</p>
</ProsePage>
