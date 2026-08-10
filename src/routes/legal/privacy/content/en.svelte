<script lang="ts">
	import ProsePage from '$lib/components/prose-page.svelte';
</script>

<ProsePage title="Privacy policy" subtitle="Last updated: 1 August 2026">
	<p>
		Drizz.li is built to need as little of your data as possible: there are no user accounts, no
		cookies, no advertising and no analytics or tracking scripts. This page explains what little
		processing does happen when you browse the site.
	</p>

	<h2>1. Controller</h2>
	<address>
		Vincent van der Wal<br />
		Tschalungasse 2, CH-6442 Gersau, Switzerland <br />
		Email:
		<a href="mailto:drizzli@vincentvanderwal.nl">drizzli@vincentvanderwal.nl</a>
	</address>
	<p>This policy covers the website drizz.li.</p>

	<h2>2. Browsing the site</h2>
	<h3>Weather data requests</h3>
	<p>
		Drizz.li is a static site: when you open a forecast, your browser fetches the weather data
		directly from the open-data APIs of
		<a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a>
		(api.open-meteo.com, geocoding-api.open-meteo.com, archive-api.open-meteo.com, ensemble-api.open-meteo.com,
		and map tiles from maps.open-meteo.com / map-tiles.open-meteo.com / map-assets.open-meteo.com). Like
		any web request, this transmits your IP address and the requested location or search term to Open-Meteo.
		We do not receive or store any of this. See
		<a href="https://open-meteo.com/en/terms" target="_blank" rel="noopener"
			>Open-Meteo's terms and privacy information</a
		>. Legal basis: our legitimate interest in delivering the content you request (Art. 6(1)(f)
		GDPR).
	</p>
	<h3>Hosting</h3>
	<p>
		The static site is served by Cloudflare Pages (Cloudflare, Inc., USA). The hosting
		infrastructure may keep short-lived technical server logs (IP address, requested URL, timestamp)
		for security and operations. Legal basis: legitimate interest in a secure, reliable service
		(Art. 6(1)(f) GDPR).
	</p>
	<h3>Settings on your device (local storage)</h3>
	<p>
		Your preferences - theme, measurement units, last searched location and chart options - are
		stored only in your browser's local storage. They never leave your device, and you can clear
		them at any time via your browser.
	</p>

	<h2>3. Recipients</h2>
	<p>
		We do not sell or share personal data with third parties for their own purposes. Recipients are
		limited to: Open-Meteo (weather requests made directly by your browser) and our hosting
		provider.
	</p>

	<h2>4. Your rights</h2>
	<p>
		Under the GDPR you have the right to access, rectification, erasure, restriction of processing,
		data portability, and to object to processing based on legitimate interest. Where processing is
		based on consent, you may withdraw it at any time. To exercise any of these rights, email
		<a href="mailto:drizzli@vincentvanderwal.nl">drizzli@vincentvanderwal.nl</a>. You also have the
		right to lodge a complaint with a supervisory authority, in particular in the EU member state of
		your residence, or with [competent supervisory authority of the controller].
	</p>
	<p>
		For visitors from Switzerland: the corresponding rights under the Swiss Federal Act on Data
		Protection (FADP) apply equivalently.
	</p>

	<h2>5. Changes</h2>
	<p>
		We may update this policy when the service changes; the date above reflects the latest revision.
	</p>
</ProsePage>
