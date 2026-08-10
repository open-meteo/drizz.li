<script lang="ts">
	import LocalizedContent from '$lib/components/localized-content.svelte';

	import de from './content/de.svelte';
	import en from './content/en.svelte';
	import es from './content/es.svelte';
	import fr from './content/fr.svelte';
	import it from './content/it.svelte';
</script>

<LocalizedContent variants={{ en, de, es, fr, it }} />
