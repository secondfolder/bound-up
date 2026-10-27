<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import NotebookWidget from '$lib/components/notebook/NotebookWidget.svelte';
	import PartnerMessagesWidget from '$lib/components/PartnerMessagesWidget.svelte';
	import RewardsWidget from '$lib/components/RewardsWidget.svelte';
	import SectionWidget from '$lib/components/SectionWidget.svelte';
	import TasksWidget from '$lib/components/TasksWidget.svelte';
	import TimeZoneDisplay from '$lib/components/TimeZoneDisplay.svelte';
	import { initialsFor } from '$lib/initials';
	import { partnerName, viewerNames } from '$lib/partner-names.svelte';
	import { UTC_TIMEZONE } from '$lib/timezone';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let partner = $derived(data.partner);
	/** The names, opened in the browser (`partner-names.svelte.ts`); placeholders until then. */
	const names = $derived(viewerNames(partner.names));
	const shownName = $derived(partnerName(partner.names));
	const viewerTimezone = $derived(page.data.user?.timezone ?? UTC_TIMEZONE);
</script>

<section>
	<header>
		<wa-avatar
			image={partner.image ?? undefined}
			initials={initialsFor(shownName)}
			label={shownName}
		></wa-avatar>
		<h1>{shownName}</h1>
		{#if names?.partnerRole}
			<p class="label">{names.yourName}'s {names.partnerRole}</p>
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

		<!-- This partnership's alone, so they open their lists in its context. -->
		<TasksWidget
			tasks={data.tasks}
			href={resolve('/(auth-required)/(app)/tasks')}
			opensIn={{ kind: 'space', spaceId: partner.id }}
		/>

		<RewardsWidget
			rewards={data.rewards}
			href={resolve('/(auth-required)/(app)/rewards')}
			opensIn={{ kind: 'space', spaceId: partner.id }}
		/>

		<NotebookWidget
			items={data.notebook}
			spaceId={partner.id}
		/>

		<!-- A card with no body rather than a plain link under the others: the
		     kink list has no summary worth a preview, and what it shows a partner
		     is sealed until the page opens it. As a bare link it read as an
		     afterthought tacked on under three cards. -->
		<SectionWidget
			title="Kink lists"
			icon="clipboard-list"
			href={resolve('/(auth-required)/(app)/playroom/kink-list/partner/[partnershipId]', {
				partnershipId: partner.id
			})}
		/>
	</div>

	<!-- Settings is not a section of the relationship, so it stays a quiet link
	     at the foot rather than a fifth card. -->
	<a class="settings" href={resolve('/(auth-required)/(app)/settings/partners/[id]', { id: partner.id })}>
		<wa-icon name="gear" variant="solid"></wa-icon>
		{partner.canEdit ? 'Edit this connection' : 'Connection settings'}
	</a>
</section>

<style>
	section {
		max-width: var(--page-width-narrow);
		margin: 0 auto;
		padding: var(--wa-space-l) var(--page-gutter);
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
			/* The same column as the cards on /home, so the one component does not
			   change width between the two pages. */
			max-inline-size: var(--card-column-width);
			/* Sized by the column, never by what is in it: a preview row is a
			   single ellipsised line, and its full unwrapped width once pushed
			   this page off the side of a phone. */
			contain: inline-size;
			display: flex;
			flex-direction: column;
			gap: 1rem;
			text-align: start;
		}

		.settings {
			display: inline-flex;
			align-items: center;
			gap: 0.5rem;
			/* A tap target, not just a line of text. */
			min-block-size: 2.75rem;
			color: var(--wa-color-text-quiet);
			font-size: 0.9375rem;

			wa-icon {
				font-size: 0.875em;
			}
		}
	}
</style>
