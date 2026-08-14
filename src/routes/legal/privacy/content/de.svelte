<script lang="ts">
	import ProsePage from '$lib/components/prose-page.svelte';
</script>

<ProsePage title="Datenschutzerklärung" subtitle="Zuletzt aktualisiert: 14. August 2026">
	<p>
		Drizz.li ist so gebaut, dass möglichst wenige Ihrer Daten nötig sind: keine Benutzerkonten,
		keine Cookies, keine Werbung, keine Analyse- oder Tracking-Skripte. Diese Seite erklärt, welche
		wenige Verarbeitung beim Besuch der Seite dennoch stattfindet.
	</p>

	<h2>1. Verantwortlicher</h2>
	<address>
		Vincent van der Wal<br />
		Tschalungasse 2, CH-6442 Gersau, Switzerland <br />
		E-Mail:
		<a href="mailto:info@drizz.li">info@drizz.li</a>
	</address>
	<p>Diese Erklärung gilt für die Website drizz.li.</p>

	<h2>2. Besuch der Website</h2>
	<h3>Abruf der Wetterdaten</h3>
	<p>
		Drizz.li ist eine statische Seite: Wenn Sie eine Vorhersage öffnen, ruft Ihr Browser die
		Wetterdaten direkt bei den Open-Data-Schnittstellen von
		<a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a>. Wie bei jeder
		Webanfrage werden dabei Ihre IP-Adresse und der gewünschte Ort bzw. Suchbegriff an Open-Meteo
		übertragen. Wir erhalten und speichern davon nichts. Siehe
		<a href="https://open-meteo.com/en/terms" target="_blank" rel="noopener"
			>Nutzungs- und Datenschutzhinweise von Open-Meteo</a
		>. Rechtsgrundlage: unser berechtigtes Interesse an der Auslieferung der angeforderten Inhalte
		(Art. 6 Abs. 1 lit. f DSGVO).
	</p>
	<h3>Hosting</h3>
	<p>
		Die Seite wird über Cloudflare Workers (Cloudflare, Inc., USA) ausgeliefert. Die
		Hosting-Infrastruktur kann kurzlebige technische Server-Logs (IP-Adresse, angefragte URL,
		Zeitstempel) zu Sicherheits- und Betriebszwecken speichern. Rechtsgrundlage: berechtigtes
		Interesse an einem sicheren, zuverlässigen Dienst (Art. 6 Abs. 1 lit. f DSGVO).
	</p>
	<h3>Ungefährer Standort beim ersten Besuch</h3>
	<p>
		Wenn Sie die Seite ohne Ort in der URL öffnen, fragt sie bei unserem eigenen Geo-Endpunkt den
		ungefähren Standort (etwa auf Stadtebene) ab, den Cloudflare aus Ihrer IP-Adresse ableitet,
		damit die erste Vorhersage eine Vorhersage in Ihrer Nähe ist. Die Antwort geht ausschliesslich
		an Ihren Browser: Sie wird nicht gespeichert, nicht zu einem Profil verknüpft und nicht
		weitergegeben. Ihr Browser löst den Ortsnamen anschliessend wie oben beschrieben über die
		Geocoding-API von Open-Meteo auf und legt den Ort im Local Storage ab, damit die Abfrage nicht
		erneut nötig ist. Rechtsgrundlage: berechtigtes Interesse daran, sofort relevante Inhalte zu
		zeigen (Art. 6 Abs. 1 lit. f DSGVO). Der genaue GPS-Standort Ihres Geräts wird dabei nicht
		verwendet; er wird nur ausgelesen, wenn Sie ihn in der Ortssuche ausdrücklich anfordern.
	</p>
	<h3>Einstellungen auf Ihrem Gerät (Local Storage)</h3>
	<p>
		Ihre Einstellungen - Design, Masseinheiten, zuletzt gesuchter Ort und Diagrammoptionen - werden
		ausschliesslich im Local Storage Ihres Browsers gespeichert. Sie verlassen Ihr Gerät nicht, und
		Sie können sie jederzeit über Ihren Browser löschen.
	</p>

	<h2>3. Empfänger</h2>
	<p>
		Wir verkaufen personenbezogene Daten nicht und geben sie nicht für eigene Zwecke Dritter weiter.
		Empfänger sind ausschliesslich: Open-Meteo (Wetterabrufe direkt durch Ihren Browser) und unser
		Hosting-Anbieter.
	</p>

	<h2>4. Ihre Rechte</h2>
	<p>
		Nach der DSGVO haben Sie das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der
		Verarbeitung, Datenübertragbarkeit sowie das Recht, einer auf berechtigtem Interesse beruhenden
		Verarbeitung zu widersprechen. Beruht eine Verarbeitung auf Einwilligung, können Sie diese
		jederzeit widerrufen. Zur Ausübung schreiben Sie an
		<a href="mailto:info@drizz.li">info@drizz.li</a>. Ausserdem haben Sie das Recht, sich bei einer
		Aufsichtsbehörde zu beschweren, insbesondere im EU-Mitgliedstaat Ihres Wohnsitzes, oder bei
		[zuständige Aufsichtsbehörde des Verantwortlichen].
	</p>
	<p>
		Für Besucherinnen und Besucher aus der Schweiz gelten die entsprechenden Rechte nach dem
		Bundesgesetz über den Datenschutz (DSG) sinngemäss.
	</p>

	<h2>5. Änderungen</h2>
	<p>
		Wir aktualisieren diese Erklärung, wenn sich der Dienst ändert; das Datum oben nennt die letzte
		Fassung.
	</p>
	<p class="text-muted-foreground">
		Massgeblich ist die englische Fassung dieser Datenschutzerklärung.
	</p>
</ProsePage>
