<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { initialsFor } from '$lib/initials';
	import { UTC_TIMEZONE } from '$lib/timezone';
	import PartnerMessagesWidget from '$lib/components/PartnerMessagesWidget.svelte';
	import RewardsWidget from '$lib/components/RewardsWidget.svelte';
	import TasksWidget from '$lib/components/TasksWidget.svelte';
	import TimeZoneDisplay from '$lib/components/TimeZoneDisplay.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let partner = $derived(data.partner);
	const viewerTimezone = $derived(page.data.user?.timezone ?? UTC_TIMEZONE);
</script>

<section>
	<header>
		<wa-avatar
			image={partner.image ?? undefined}
			initials={initialsFor(partner.name)}
			label={partner.name}
		></wa-avatar>
		<h1>{partner.name}</h1>
		{#if partner.partnerRole}
			<p class="label">{partner.yourName}'s {partner.partnerRole}</p>
		{/if}
		<TimeZoneDisplay
			timeZone={partner.timezone}
			referenceTimeZone={viewerTimezone}
			showCurrentTime={true}
		/>
	</header>

	<div class="widgets">
		<PartnerMessagesWidget
			messages={data.messages}
			href={resolve('/(auth-required)/(app)/partner/[id]/messages', { id: partner.id })}
		/>

		<!-- `tasks` and `rewards` are null only when the widget's own membership
		     check said this viewer has no business with that section, which the
		     404 above has already ruled out for an accepted partnership. Guarded
		     rather than asserted so a future control mode cannot crash the page. -->
		{#if data.tasks}
			<TasksWidget
				tasks={data.tasks}
				href={resolve('/(auth-required)/(app)/partner/[id]/tasks', { id: partner.id })}
			/>
		{/if}

		{#if data.rewards}
			<RewardsWidget
				rewards={data.rewards}
				href={resolve('/(auth-required)/(app)/partner/[id]/rewards', { id: partner.id })}
			/>
		{/if}
	</div>

	<a href={resolve('/(auth-required)/(app)/settings/partners/[id]', { id: partner.id })}>
		{partner.canEdit ? 'Edit this connection' : 'Connection settings'}
	</a>
</section>

<style>
	section {
		max-width: 40rem;
		margin: 0 auto;
		padding: var(--wa-space-l);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		text-align: center;

		header {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 0.75rem;

			wa-avatar {
				--size: 5rem;
			}

			h1 {
				margin: 0;
			}

			.label {
				margin: 0;
				color: var(--wa-color-text-quiet);
			}
		}

		p {
			margin: 0;
		}

		/* The cards read left-aligned, unlike the centred header above them: a
		   preview list centred under its own title is much harder to scan. */
		.widgets {
			inline-size: 100%;
			display: flex;
			flex-direction: column;
			gap: 1rem;
			text-align: start;
		}
	}
</style>
