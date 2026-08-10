<script lang="ts">
	import ProsePage from '$lib/components/prose-page.svelte';
</script>

<ProsePage title="Política de privacidad" subtitle="Última actualización: 1 de agosto de 2026">
	<p>
		Drizz.li está hecho para necesitar los mínimos datos posibles: sin cuentas, sin cookies, sin
		publicidad y sin scripts de analítica ni de seguimiento. Esta página explica el poco tratamiento
		que sí ocurre al navegar por el sitio.
	</p>

	<h2>1. Responsable</h2>
	<address>
		Vincent van der Wal<br />
		Tschalungasse 2, CH-6442 Gersau, Switzerland <br />
		Correo electrónico:
		<a href="mailto:drizzli@vincentvanderwal.nl">drizzli@vincentvanderwal.nl</a>
	</address>
	<p>Esta política cubre el sitio drizz.li.</p>

	<h2>2. Navegación por el sitio</h2>
	<h3>Peticiones de datos meteorológicos</h3>
	<p>
		Drizz.li es un sitio estático: cuando abres un pronóstico, tu navegador obtiene los datos
		directamente de las API abiertas de
		<a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a>. Como en
		cualquier petición web, esto transmite tu dirección IP y la ubicación o término buscado a
		Open-Meteo. Nosotros no recibimos ni almacenamos nada de eso. Consulta
		<a href="https://open-meteo.com/en/terms" target="_blank" rel="noopener"
			>las condiciones e información de privacidad de Open-Meteo</a
		>. Base jurídica: nuestro interés legítimo en entregar el contenido que solicitas (art. 6.1.f
		del RGPD).
	</p>
	<h3>Alojamiento</h3>
	<p>
		El sitio estático lo sirve Cloudflare Pages (Cloudflare, Inc., EE. UU.). La infraestructura
		puede conservar registros técnicos de corta duración (dirección IP, URL solicitada, marca de
		tiempo) por seguridad y operación. Base jurídica: interés legítimo en un servicio seguro y
		fiable (art. 6.1.f del RGPD).
	</p>
	<h3>Ajustes en tu dispositivo (almacenamiento local)</h3>
	<p>
		Tus preferencias - tema, unidades, última ubicación buscada y opciones de los gráficos - se
		guardan únicamente en el almacenamiento local de tu navegador. No salen de tu dispositivo y
		puedes borrarlas cuando quieras.
	</p>

	<h2>3. Destinatarios</h2>
	<p>
		No vendemos ni compartimos datos personales con terceros para sus propios fines. Los
		destinatarios se limitan a: Open-Meteo (peticiones meteorológicas hechas directamente por tu
		navegador) y nuestro proveedor de alojamiento.
	</p>

	<h2>4. Tus derechos</h2>
	<p>
		Conforme al RGPD tienes derecho de acceso, rectificación, supresión, limitación del tratamiento,
		portabilidad y oposición al tratamiento basado en el interés legítimo. Cuando el tratamiento se
		base en el consentimiento, puedes retirarlo en cualquier momento. Para ejercer estos derechos,
		escribe a
		<a href="mailto:drizzli@vincentvanderwal.nl">drizzli@vincentvanderwal.nl</a>. También tienes
		derecho a presentar una reclamación ante una autoridad de control, en particular en el Estado
		miembro de tu residencia, o ante [autoridad de control competente].
	</p>
	<p>
		Para visitantes desde Suiza, se aplican de forma equivalente los derechos correspondientes de la
		Ley Federal de Protección de Datos (LPD).
	</p>

	<h2>5. Cambios</h2>
	<p>
		Podemos actualizar esta política cuando cambie el servicio; la fecha de arriba refleja la última
		revisión.
	</p>
	<p class="text-muted-foreground">
		En caso de discrepancia prevalece la versión inglesa de esta política.
	</p>
</ProsePage>
