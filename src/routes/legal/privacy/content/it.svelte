<script lang="ts">
	import ProsePage from '$lib/components/prose-page.svelte';
</script>

<ProsePage title="Informativa sulla privacy" subtitle="Ultimo aggiornamento: 1 agosto 2026">
	<p>
		Drizz.li è costruito per aver bisogno del minimo dei tuoi dati: nessun account, nessun cookie,
		nessuna pubblicità, nessuno script di analisi o tracciamento. Questa pagina spiega il poco
		trattamento che avviene comunque quando navighi sul sito.
	</p>

	<h2>1. Titolare del trattamento</h2>
	<address>
		Vincent van der Wal<br />
		Tschalungasse 2, CH-6442 Gersau, Switzerland <br />
		E-mail:
		<a href="mailto:drizzli@vincentvanderwal.nl">drizzli@vincentvanderwal.nl</a>
	</address>
	<p>Questa informativa copre il sito drizz.li.</p>

	<h2>2. Navigazione sul sito</h2>
	<h3>Richieste di dati meteo</h3>
	<p>
		Drizz.li è un sito statico: quando apri una previsione, il tuo browser scarica i dati
		direttamente dalle API aperte di
		<a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a>. Come per
		qualsiasi richiesta web, questo trasmette il tuo indirizzo IP e la località o il termine cercato
		a Open-Meteo. Noi non riceviamo né conserviamo nulla di tutto ciò. Vedi
		<a href="https://open-meteo.com/en/terms" target="_blank" rel="noopener"
			>le condizioni e le informazioni sulla privacy di Open-Meteo</a
		>. Base giuridica: il nostro legittimo interesse a fornire il contenuto richiesto (art. 6, par.
		1, lett. f del GDPR).
	</p>
	<h3>Hosting</h3>
	<p>
		Il sito statico è servito da Cloudflare Pages (Cloudflare, Inc., USA). L'infrastruttura può
		conservare brevi log tecnici del server (indirizzo IP, URL richiesto, data e ora) per sicurezza
		e gestione. Base giuridica: legittimo interesse a un servizio sicuro e affidabile (art. 6, par.
		1, lett. f del GDPR).
	</p>
	<h3>Impostazioni sul tuo dispositivo (archiviazione locale)</h3>
	<p>
		Le tue preferenze - tema, unità di misura, ultima località cercata e opzioni dei grafici - sono
		salvate solo nell'archiviazione locale del browser. Non lasciano il tuo dispositivo e puoi
		cancellarle quando vuoi.
	</p>

	<h2>3. Destinatari</h2>
	<p>
		Non vendiamo né condividiamo dati personali con terzi per finalità proprie. I destinatari si
		limitano a: Open-Meteo (richieste meteo fatte direttamente dal tuo browser) e il nostro
		fornitore di hosting.
	</p>

	<h2>4. I tuoi diritti</h2>
	<p>
		In base al GDPR hai diritto di accesso, rettifica, cancellazione, limitazione del trattamento,
		portabilità dei dati e opposizione al trattamento fondato sul legittimo interesse. Se il
		trattamento si basa sul consenso, puoi revocarlo in qualsiasi momento. Per esercitare questi
		diritti scrivi a
		<a href="mailto:drizzli@vincentvanderwal.nl">drizzli@vincentvanderwal.nl</a>. Hai inoltre il
		diritto di proporre reclamo a un'autorità di controllo, in particolare nello Stato membro di
		residenza, o a [autorità di controllo competente].
	</p>
	<p>
		Per i visitatori dalla Svizzera valgono in modo equivalente i corrispondenti diritti previsti
		dalla Legge federale sulla protezione dei dati (LPD).
	</p>

	<h2>5. Modifiche</h2>
	<p>
		Possiamo aggiornare questa informativa quando il servizio cambia; la data in alto indica
		l'ultima revisione.
	</p>
	<p class="text-muted-foreground">
		In caso di discrepanza prevale la versione inglese di questa informativa.
	</p>
</ProsePage>
