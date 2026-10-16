<script lang="ts">
	import DaydreamLibrary from '$lib/components/DaydreamLibrary.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<DaydreamLibrary kind="characters" items={data.items} suggestionsOn={data.accepted && data.available} />
