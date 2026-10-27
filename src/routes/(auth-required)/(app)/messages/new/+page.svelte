<script lang="ts">
	// The board itself, which opens its dialog on this route (`onNewRoute`).
	// Reached by a full load only: the board opens the dialog by shallow
	// routing, so it stays mounted rather than being swapped for this.
	import Board from '../+page.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<Board {data} />
