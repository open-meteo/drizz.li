<script lang="ts">
	import ProsePage from '$lib/components/prose-page.svelte';
</script>

<ProsePage title="Mentions légales" subtitle="Identification de l'éditeur.">
	<h2>Éditeur du service</h2>
	<address>
		Vincent van der Wal<br />
		Tschalungasse 2<br />
		CH-6442 Gersau<br />
		Switzerland
	</address>
	<p>
		E-mail: <a href="mailto:info@drizz.li">info@drizz.li</a>
	</p>

	<h2>Avertissement</h2>
	<p>
		Les données météo présentées ici sont fournies à titre d'information générale. Les prévisions
		sont par nature incertaines ; ne vous y fiez pas lorsque des vies, la santé ou des biens sont en
		jeu - consultez les alertes officielles de votre service météorologique national.
	</p>
	<p>
		Les données météo et géographiques proviennent d'
		<a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a>, qui n'est pas
		affilié à ce site. Les liens externes sont fournis de bonne foi ; leur contenu relève de la
		responsabilité de leurs exploitants.
	</p>
	<p class="text-muted-foreground">
		En cas de divergence, la version anglaise de ces mentions fait foi.
	</p>
</ProsePage>
