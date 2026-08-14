<script lang="ts">
	import ProsePage from '$lib/components/prose-page.svelte';
</script>

<ProsePage title="Politique de confidentialité" subtitle="Dernière mise à jour : 14 août 2026">
	<p>
		Drizz.li est conçu pour avoir besoin du minimum de vos données : aucun compte, aucun cookie,
		aucune publicité, aucun script d'analyse ou de suivi. Cette page explique le peu de traitement
		qui a lieu lorsque vous consultez le site.
	</p>

	<h2>1. Responsable du traitement</h2>
	<address>
		Vincent van der Wal<br />
		Tschalungasse 2, CH-6442 Gersau, Switzerland <br />
		E-mail:
		<a href="mailto:info@drizz.li">info@drizz.li</a>
	</address>
	<p>Cette politique couvre le site drizz.li.</p>

	<h2>2. Navigation sur le site</h2>
	<h3>Requêtes de données météo</h3>
	<p>
		Drizz.li est un site statique : lorsque vous ouvrez une prévision, votre navigateur récupère les
		données directement auprès des API ouvertes d'
		<a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a>. Comme pour toute
		requête web, cela transmet votre adresse IP et le lieu ou le terme recherché à Open-Meteo. Nous
		n'en recevons ni n'en conservons rien. Voir
		<a href="https://open-meteo.com/en/terms" target="_blank" rel="noopener"
			>les conditions et informations de confidentialité d'Open-Meteo</a
		>. Base légale : notre intérêt légitime à fournir le contenu demandé (art. 6, par. 1, point f)
		du RGPD).
	</p>
	<h3>Hébergement</h3>
	<p>
		Le site est servi par Cloudflare Workers (Cloudflare, Inc., États-Unis). L'infrastructure
		d'hébergement peut conserver de brefs journaux techniques (adresse IP, URL demandée, horodatage)
		à des fins de sécurité et d'exploitation. Base légale : intérêt légitime à un service sûr et
		fiable (art. 6, par. 1, point f) du RGPD).
	</p>
	<h3>Localisation approximative lors d'une première visite</h3>
	<p>
		Lorsque vous ouvrez le site sans lieu dans l'URL, la page demande à notre propre point de
		terminaison de géolocalisation la position approximative (à l'échelle de la ville) que
		Cloudflare déduit de votre adresse IP, afin que la première prévision affichée soit proche de
		vous. La réponse n'est transmise qu'à votre navigateur : elle n'est ni conservée, ni rattachée à
		un profil, ni communiquée à des tiers. Votre navigateur résout ensuite ce nom de ville via l'API
		de géocodage d'Open-Meteo, comme décrit ci-dessus, et conserve le lieu dans le stockage local
		afin de ne pas refaire la requête. Base légale : intérêt légitime à afficher immédiatement un
		contenu pertinent (art. 6, par. 1, point f) du RGPD). Rien de tout cela n'utilise la position
		GPS précise de votre appareil, qui n'est lue que si vous la demandez explicitement dans la
		recherche de lieu.
	</p>
	<h3>Réglages sur votre appareil (stockage local)</h3>
	<p>
		Vos préférences - thème, unités, dernier lieu recherché et options des graphiques - sont
		stockées uniquement dans le stockage local de votre navigateur. Elles ne quittent pas votre
		appareil et vous pouvez les effacer à tout moment.
	</p>

	<h2>3. Destinataires</h2>
	<p>
		Nous ne vendons ni ne partageons de données personnelles avec des tiers pour leurs propres
		finalités. Les destinataires se limitent à : Open-Meteo (requêtes météo effectuées directement
		par votre navigateur) et notre hébergeur.
	</p>

	<h2>4. Vos droits</h2>
	<p>
		En vertu du RGPD, vous disposez d'un droit d'accès, de rectification, d'effacement, de
		limitation du traitement, de portabilité, et d'opposition au traitement fondé sur l'intérêt
		légitime. Lorsque le traitement repose sur le consentement, vous pouvez le retirer à tout
		moment. Pour exercer ces droits, écrivez à
		<a href="mailto:info@drizz.li">info@drizz.li</a>. Vous avez également le droit d'introduire une
		réclamation auprès d'une autorité de contrôle, notamment dans l'État membre de votre résidence,
		ou auprès de [autorité de contrôle compétente].
	</p>
	<p>
		Pour les visiteurs suisses, les droits correspondants de la loi fédérale sur la protection des
		données (LPD) s'appliquent de manière équivalente.
	</p>

	<h2>5. Modifications</h2>
	<p>
		Nous pouvons mettre à jour cette politique lorsque le service évolue ; la date ci-dessus indique
		la dernière révision.
	</p>
	<p class="text-muted-foreground">
		En cas de divergence, la version anglaise de cette politique fait foi.
	</p>
</ProsePage>
