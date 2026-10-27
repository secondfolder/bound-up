<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import SceneMenuPage from '$lib/components/notebook/SceneMenuPage.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/** A solo scene's only other writer is you, on another device. */
	const cursorLabel = () => ({
		name: 'You, on another device',
		color: 'var(--wa-color-success-fill-loud)'
	});
</script>

<SceneMenuPage
	entry={data.entry}
	menuId={data.menuId}
	partnerId={data.partnerId}
	room={data.room}
	viewerId={data.viewerId}
	sealScope={{ kind: 'self' }}
	dependency={`notebook:entry:${data.entry.id}`}
	sceneHref={resolve('/(auth-required)/(app)/home/notebook/[entryId]', { entryId: data.entry.id })}
	{cursorLabel}
	onGone={() => goto(resolve('/(auth-required)/(app)/home/notebook'))}
/>
