<script lang="ts">
	import ProsePage from '$lib/components/prose-page.svelte';
</script>

<ProsePage title="À propos de Drizz.li" subtitle="Un petit site météo open source.">
	<p>
		Drizz.li fait partie du projet
		<a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a>. Il propose des
		prévisions multi-modèles, des comparaisons de modèles, des tendances à 14 jours, des cartes
		météo, un aperçu saisonnier et des données historiques, sans compte, sans publicité et sans
		traceurs.
	</p>

	<h2>Comment ça marche</h2>
	<p>
		Toutes les données proviennent des API ouvertes d'Open-Meteo, qui agrègent les services
		météorologiques nationaux (DWD, NOAA, Météo-France, MeteoSwiss et d'autres). Drizz.li est un
		site statique : les prévisions sont récupérées directement par votre navigateur et affichées sur
		votre appareil.
	</p>
	<p>
		Le site est open source. Chacun peut lire le code, signaler un problème ou proposer des
		améliorations sur
		<a href="https://github.com/open-meteo/drizz.li" target="_blank" rel="noopener">GitHub</a>.
	</p>

	<h2>Contact</h2>
	<p>
		Questions, retours ou signalements de bugs :
		<a href="mailto:info@drizz.li">info@drizz.li</a>
	</p>
</ProsePage>
