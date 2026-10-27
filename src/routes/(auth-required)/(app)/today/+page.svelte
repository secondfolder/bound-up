<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ContextAvatar from '$lib/components/context/ContextAvatar.svelte';
	import ContextSwitcher from '$lib/components/context/ContextSwitcher.svelte';
	import DaydreamsWidget from '$lib/components/DaydreamsWidget.svelte';
	import GuidesWidget from '$lib/components/GuidesWidget.svelte';
	import NotebookWidget from '$lib/components/notebook/NotebookWidget.svelte';
	import PartnerMessagesWidget from '$lib/components/PartnerMessagesWidget.svelte';
	import PlayroomWidget from '$lib/components/PlayroomWidget.svelte';
	import RewardsWidget from '$lib/components/RewardsWidget.svelte';
	import SectionWidget from '$lib/components/SectionWidget.svelte';
	import TasksWidget from '$lib/components/TasksWidget.svelte';
	import TimeZoneDisplay from '$lib/components/TimeZoneDisplay.svelte';
	import UnreadMessagesWidget from '$lib/components/UnreadMessagesWidget.svelte';
	import { ALL_CONTEXT, type AppContext } from '$lib/context';
	import { shownSpace } from '$lib/context-client.svelte';
	import { viewerNames } from '$lib/partner-names.svelte';
	import { UTC_TIMEZONE } from '$lib/timezone';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const today = $derived(data.today);
	const viewerTimezone = $derived(page.data.user?.timezone ?? UTC_TIMEZONE);

	const tasksHref = resolve('/(auth-required)/(app)/tasks');
	const rewardsHref = resolve('/(auth-required)/(app)/rewards');
	const playroomHref = resolve('/(auth-required)/(app)/playroom');
	const guidesHref = resolve('/(auth-required)/(app)/guides');
	const daydreamsHref = resolve('/(auth-required)/(app)/daydreams');

	/** The context every card here previews: the lists they lead to open in it. */
	const shownContext = $derived<AppContext>(
		today.kind === 'all'
			? ALL_CONTEXT
			: { kind: 'space', spaceId: today.kind === 'solo' ? today.spaceId : today.partner.id }
	);

	/**
	 * A partnership's header: its name and colour as the switcher draws them
	 * (so the two never disagree), and the names opened in the browser, which
	 * read "…" until then (invariant 12).
	 */
	const partnerShown = $derived.by(() => {
		if (today.kind !== 'shared') {
			return null;
		}
		const { id } = today.partner;
		const space = data.contextSpaces.find((candidate) => candidate.id === id);
		return space ? shownSpace(space) : null;
	});
	const names = $derived(today.kind === 'shared' ? viewerNames(today.partner.names) : null);
</script>

<div class="today">
	<header class="title">
		<h1>Today</h1>
		<div class="corner">
			<ContextSwitcher spaces={data.contextSpaces} context={data.context} you={data.user?.name ?? ''} />
		</div>
	</header>

	{#if today.kind === 'shared'}
		<!-- The partnership's own place, as its page was: who, whose time it is
		     there, and the way to its settings. -->
		<section class="partner" aria-label={partnerShown?.name ?? 'Partner'}>
			<ContextAvatar
				kind="shared"
				size={80}
				people={partnerShown ? [{ colour: partnerShown.colour, initials: partnerShown.initials }] : []}
			/>
			<h2>{partnerShown?.name ?? '…'}</h2>
			{#if names?.partnerRole}
				<p class="label">{names.yourName}'s {names.partnerRole}</p>
			{/if}
			<TimeZoneDisplay
				timeZone={today.partner.timezone}
				referenceTimeZone={viewerTimezone}
				showCurrentTime={true}
			/>
			<a
				class="settings"
				href={resolve('/(auth-required)/(app)/settings/partners/[id]', { id: today.partner.id })}
			>
				<wa-icon name="gear" variant="solid"></wa-icon>
				{today.partner.canEdit ? 'Edit this connection' : 'Connection settings'}
			</a>
		</section>
	{/if}

	<div class="widgets">
		{#if today.kind === 'all'}
			<!-- First on purpose: something waiting from a partner is the reason to
			     have opened the app, and it should not be below the fold on a short
			     phone. Renders nothing when there is nothing waiting. -->
			<UnreadMessagesWidget unread={today.unread} />
			<!-- Only for an account that holds the guides feature: the load returns
			     null otherwise, and /guides would refuse them anyway. -->
			{#if today.guides}
				<GuidesWidget guides={today.guides} href={guidesHref} />
			{/if}
			<!-- Likewise only for an account that holds the daydreams feature. -->
			{#if today.daydreams}
				<DaydreamsWidget daydreams={today.daydreams} href={daydreamsHref} />
			{/if}
			<!-- Both cover every space the viewer is in, so they open their lists
			     in Everyone, which is where this page already is. -->
			<TasksWidget tasks={today.tasks} href={tasksHref} opensIn={shownContext} />
			<RewardsWidget rewards={today.rewards} href={rewardsHref} opensIn={shownContext} />
			<!-- Your own notebook, so it opens in Me: a deliberate choice of that
			     context, as the card says whose it is previewing. -->
			<NotebookWidget items={today.notebook} spaceId={today.soloSpaceId} />
			<PlayroomWidget latestIq={today.latestIq} href={playroomHref} />
		{:else if today.kind === 'solo'}
			<!-- Your own cards and nothing of a partner's: Me is what a screen
			     shown to someone else can safely be left on. -->
			<TasksWidget tasks={today.tasks} href={tasksHref} opensIn={shownContext} />
			<RewardsWidget rewards={today.rewards} href={rewardsHref} opensIn={shownContext} />
			<NotebookWidget items={today.notebook} spaceId={today.spaceId} />
			{#if today.daydreams}
				<DaydreamsWidget daydreams={today.daydreams} href={daydreamsHref} />
			{/if}
			<PlayroomWidget latestIq={today.latestIq} href={playroomHref} />
			{#if today.guides}
				<GuidesWidget guides={today.guides} href={guidesHref} />
			{/if}
		{:else}
			<PartnerMessagesWidget
				messages={today.messages}
				href={resolve('/(auth-required)/(app)/messages')}
				opensIn={shownContext}
			/>
			<TasksWidget tasks={today.tasks} href={tasksHref} opensIn={shownContext} />
			<RewardsWidget rewards={today.rewards} href={rewardsHref} opensIn={shownContext} />
			<NotebookWidget items={today.notebook} spaceId={today.partner.id} />
			<!-- A card with no body: the kink list has no summary worth a preview,
			     and what it shows a partner is sealed until the page opens it. -->
			<SectionWidget
				title="Kink lists"
				icon="clipboard-list"
				href={resolve('/(auth-required)/(app)/playroom/kink-list/partner/[partnershipId]', {
					partnershipId: today.partner.id
				})}
			/>
		{/if}
	</div>
</div>

<style>
	.today {
		max-width: var(--page-width-narrow);
		margin: 0 auto;
		box-sizing: border-box;
		padding-block-end: var(--wa-space-l);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;

		/* The same inset and divider as NestedPageHeader, so moving between
		   Today and the lists the nav leads to keeps one edge; there is just
		   no way back, since this is where back goes. */
		.title {
			align-self: stretch;
			display: flex;
			align-items: center;
			gap: 0.5rem;
			margin-inline: var(--page-gutter);
			padding-block: var(--wa-space-xs) var(--wa-space-m);
			border-block-end: 1px solid var(--wa-color-surface-border);

			h1 {
				margin: 0;
			}

			.corner {
				display: flex;
				margin-inline-start: auto;
			}
		}

		.partner {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 0.75rem;
			padding-inline: var(--page-gutter);
			text-align: center;

			h2,
			p {
				margin: 0;
			}

			.label {
				color: var(--wa-color-text-quiet);
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

		/* The cards read left-aligned: a preview list centred under its own
		   title is much harder to scan. */
		.widgets {
			box-sizing: border-box;
			inline-size: 100%;
			max-inline-size: calc(var(--card-column-width) + 2 * var(--page-gutter));
			padding-inline: var(--page-gutter);
			/* Sized by the column, never by what is in it: a preview row is a
			   single ellipsised line, and its full unwrapped width once pushed
			   the old partner page off the side of a phone. */
			contain: inline-size;
			display: flex;
			flex-direction: column;
			gap: 1rem;
		}
	}
</style>
