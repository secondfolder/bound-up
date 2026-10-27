<script lang="ts">
	import { resolve } from '$app/paths';
	import DaydreamsWidget from '$lib/components/DaydreamsWidget.svelte';
	import GuidesWidget from '$lib/components/GuidesWidget.svelte';
	import NotebookWidget from '$lib/components/notebook/NotebookWidget.svelte';
	import PlayroomWidget from '$lib/components/PlayroomWidget.svelte';
	import RewardsWidget from '$lib/components/RewardsWidget.svelte';
	import TasksWidget from '$lib/components/TasksWidget.svelte';
	import UnreadMessagesWidget from '$lib/components/UnreadMessagesWidget.svelte';
	import { ALL_CONTEXT } from '$lib/context';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<div class="home">
	<header>
		<h1>Bound Up</h1>
		<span class="subtitle">Your Kink Companion</span>
	</header>

	<div class="widgets">
		<!-- First on purpose: something waiting from a partner is the reason to
		     have opened the app, and it should not be below the fold on a short
		     phone. Renders nothing when there is nothing waiting. -->
		<UnreadMessagesWidget unread={data.unread} />
		<!-- Only for an account that holds the guides feature: the load returns
		     null otherwise, and /home/guides would refuse them anyway. -->
		{#if data.guides}
			<GuidesWidget guides={data.guides} href={resolve('/(auth-required)/(app)/home/guides')} />
		{/if}
		<!-- Likewise only for an account that holds the daydreams feature. -->
		{#if data.daydreams}
			<DaydreamsWidget
				daydreams={data.daydreams}
				href={resolve('/(auth-required)/(app)/daydreams')}
			/>
		{/if}
		<!-- Both cover every space the viewer is in, so they open their lists in Everyone. -->
		<TasksWidget
			tasks={data.tasks}
			href={resolve('/(auth-required)/(app)/tasks')}
			opensIn={ALL_CONTEXT}
		/>
		<RewardsWidget
			rewards={data.rewards}
			href={resolve('/(auth-required)/(app)/rewards')}
			opensIn={ALL_CONTEXT}
		/>
		<NotebookWidget
			items={data.notebook}
			spaceId={data.contextSpaces.find((space) => space.kind === 'solo')?.id ?? null}
		/>
		<PlayroomWidget latestIq={data.latestIq} href={resolve('/(auth-required)/(app)/playroom')} />
	</div>
</div>

<style>
	.home {
		min-height: 100%;
		box-sizing: border-box;
		padding: 1rem;

		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2rem;

		header {
			text-align: center;

			h1 {
				/* Smaller than the logged-out landing page's 5rem: this one shares
				   the viewport with the nav and has to survive a phone. */
				font-size: clamp(2.5rem, 12vw, 4rem);
				margin: 0;
			}

			/* The landing page's subtitle, in the same amber as the title above
			   it (the h1 takes it from src/lib/theme.css). This used to read
			   --wa-color-text-secondary, which Web Awesome 3 does not define. */
			.subtitle {
				font-size: clamp(1rem, 5vw, 1.5rem);
				font-weight: 700;
				color: var(--accent-color);
			}
		}

		/* The cards read left-aligned, unlike the centred header above them: a
		   preview list centred under its own title is much harder to scan. */
		.widgets {
			inline-size: 100%;
			max-inline-size: var(--card-column-width);
			display: flex;
			flex-direction: column;
			gap: 1rem;
		}
	}
</style>
