<script lang="ts">
	import { resolve } from '$app/paths';
	import RewardsWidget from '$lib/components/RewardsWidget.svelte';
	import TasksWidget from '$lib/components/TasksWidget.svelte';
	import UnreadMessagesWidget from '$lib/components/UnreadMessagesWidget.svelte';
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
		<!-- No GuidesWidget for now: guides need more work before they are
		     advertised. /home/guides still works for anyone who has the link;
		     restoring the card means putting it back here and its query back in
		     the load. -->
		<TasksWidget tasks={data.tasks} href={resolve('/(auth-required)/(app)/home/tasks')} />
		<RewardsWidget rewards={data.rewards} href={resolve('/(auth-required)/(app)/home/rewards')} />
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
			max-inline-size: 30rem;
			display: flex;
			flex-direction: column;
			gap: 1rem;
		}
	}
</style>
