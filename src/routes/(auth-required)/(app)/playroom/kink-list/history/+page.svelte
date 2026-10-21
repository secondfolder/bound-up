<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { SvelteSet } from 'svelte/reactivity';
	import KinkListCrumbs from '$lib/components/kink-list/KinkListCrumbs.svelte';
	import { ACCOUNT_LIST_UNREADABLE, openOwnList } from '$lib/kink-list/account-store.svelte';
	import { LEVEL_LABELS, type ListPayload } from '$lib/kink-list/answers';
	import { kinkById, sidesOf } from '$lib/kink-list/catalog';
	import { kinkListContext } from '$lib/kink-list/context';
	import {
		CHANGE_GROUPS,
		CHANGE_LABELS,
		type Change,
		changeCount,
		changesBetween,
		kinkTimeline,
		startOfDay
	} from '$lib/kink-list/history';
	import { PENDING_TEXT } from '$lib/sealed-views.svelte';
	import type { PageData } from './$types';

	/**
	 * How your list has changed: the versions kept of it (one per burst of
	 * edits, frozen after a quiet week), any two of them compared, and one
	 * kink's answers over time. See docs/kink-list.md, "Version history".
	 */
	let { data }: { data: PageData } = $props();
	const { store, paths } = kinkListContext();

	/** `now` is the list as it stands, from the store, rather than a version. */
	type Point = { id: string; label: string; list: ListPayload; editedTo: Date };

	// The versions open once: they are frozen, and the page's own list is the store's.
	let opened = $state<Point[] | null | undefined>(undefined);
	// svelte-ignore state_referenced_locally
	const { versions } = data;
	void Promise.all(versions.map((version) => openOwnList(version.sealed))).then((lists) => {
		if (lists.some((list) => list === null)) {
			opened = null;
			return;
		}
		opened = versions.map((version, index) => ({
			id: version.id,
			label: dateLabel(version.editedTo),
			list: lists[index] as ListPayload,
			editedTo: version.editedTo
		}));
	});

	const points = $derived<Point[]>([
		...(opened ?? []),
		{ id: 'now', label: 'Now', list: store.list, editedTo: new Date() }
	]);

	// Defaults to what changed since the last version kept.
	let fromId = $state<string | undefined>(undefined);
	let toId = $state('now');
	const from = $derived(points.find((point) => point.id === fromId) ?? points.at(-2));
	const to = $derived(points.find((point) => point.id === toId) ?? points.at(-1));
	const changes = $derived(from && to ? changesBetween(from.list, to.list, from.editedTo) : null);

	const expanded = new SvelteSet<string>();

	function dateLabel(date: Date): string {
		return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
	}

	function nameOf(key: string): string {
		return kinkById(key)?.name ?? key;
	}

	/** "No longer on the list since 3 Nov 2026" for a retired kink, so its change is not read as a current one. */
	function retiredLabel(key: string): string {
		const retiredOn = kinkById(key)?.retiredOn;
		return retiredOn ? `No longer on the list since ${dateLabel(startOfDay(retiredOn))}` : '';
	}

	function partLabel(change: Change): string {
		const item = kinkById(change.key);
		const sides = item ? sidesOf(item) : null;
		if (change.part === 'whole' || !sides) {
			return '';
		}
		return change.part === 'a' ? sides[0] : sides[1];
	}

	function levelText(change: Change): string {
		const was = change.from ? LEVEL_LABELS[change.from] : 'Not answered';
		const is = change.to ? LEVEL_LABELS[change.to] : 'Not answered';
		return `${was} → ${is}`;
	}

	function timelineOf(key: string) {
		return kinkTimeline(
			points.map((point) => ({ at: point.id, list: point.list })),
			key
		);
	}

	function labelOf(id: string): string {
		return points.find((point) => point.id === id)?.label ?? '';
	}

	function toggleId(group: string, change: Change): string {
		return `${group}-${change.key}-${change.part}`;
	}

	function toggle(id: string): void {
		if (expanded.has(id)) {
			expanded.delete(id);
		} else {
			expanded.add(id);
		}
	}

	function answerText(key: string, answer: ListPayload['answers'][string] | undefined): string {
		if (!answer) {
			return 'Not answered';
		}
		const parts: string[] = [];
		if (answer.level) {
			parts.push(LEVEL_LABELS[answer.level]);
		}
		const item = kinkById(key);
		const sides = item ? sidesOf(item) : null;
		for (const [index, side] of (['a', 'b'] as const).entries()) {
			const level = answer.sides?.[side]?.level;
			if (level && sides) {
				parts.push(`${sides[index]}: ${LEVEL_LABELS[level]}`);
			}
		}
		if (answer.note?.trim()) {
			parts.push(`“${answer.note.trim()}”`);
		}
		return parts.join(' · ') || 'Not answered';
	}

	/**
	 * `wa-select` reports a choice with a `change` event on the host, which
	 * Svelte's delegated `onchange` does not reliably see across the shadow
	 * boundary (AGENTS.md), so it is listened for directly.
	 */
	function onChoose(set: (value: string) => void): Attachment<HTMLElement> {
		return (element) => {
			const listener = () => set(String((element as HTMLElement & { value: unknown }).value));
			element.addEventListener('change', listener);
			return () => element.removeEventListener('change', listener);
		};
	}
</script>

<svelte:head>
	<title>History · Kink list · Bound Up</title>
</svelte:head>

<KinkListCrumbs href={paths.home} text="Kink list" label="Back to kink list" />

<h1>How your list has changed</h1>

{#if versions.length === 0}
	<p class="quiet">
		A version of your list is kept once it has gone a week without changes. Come back after that
		to see how it has moved.
	</p>
{:else if opened === undefined}
	<p class="quiet" aria-busy="true">{PENDING_TEXT}</p>
{:else if opened === null}
	<p class="quiet">{ACCOUNT_LIST_UNREADABLE} Reload to try again.</p>
{:else}
	<section aria-labelledby="history-versions">
		<h2 id="history-versions">Versions ({versions.length})</h2>
		<ol class="versions">
			{#each versions as version (version.id)}
				<li>{dateLabel(version.editedFrom)} – {dateLabel(version.editedTo)}</li>
			{/each}
			<li>Now</li>
		</ol>
	</section>

	<div class="pick">
		<wa-select
			label="From"
			value={from?.id}
			{@attach onChoose((value) => {
				fromId = value;
			})}
		>
			{#each points as point (point.id)}
				<wa-option value={point.id}>{point.label}</wa-option>
			{/each}
		</wa-select>
		<wa-select
			label="To"
			value={to?.id}
			{@attach onChoose((value) => {
				toId = value;
			})}
		>
			{#each points as point (point.id)}
				<wa-option value={point.id}>{point.label}</wa-option>
			{/each}
		</wa-select>
	</div>

	{#if changes && changeCount(changes) === 0}
		<p class="quiet">Nothing changed between those two.</p>
	{:else if changes}
		{#each CHANGE_GROUPS as group (group)}
			{#if changes[group].length > 0}
				<section aria-labelledby="history-{group}">
					<h2 id="history-{group}">{CHANGE_LABELS[group]} ({changes[group].length})</h2>
					<ul class="changes">
						{#each changes[group] as change (`${change.key}-${change.part}`)}
							<li>
								<div class="row">
									<span class="name">
										{nameOf(change.key)}
										{#if partLabel(change)}<span class="part">({partLabel(change)})</span>{/if}
										{#if retiredLabel(change.key)}<span class="retired">{retiredLabel(change.key)}</span>{/if}
									</span>
									<!-- A disclosure trigger: wa-button does not forward aria-expanded (AGENTS.md). -->
									<button
										type="button"
										class="toggle"
										aria-expanded={expanded.has(toggleId(group, change))}
										onclick={() => toggle(toggleId(group, change))}
									>
										Over time<span class="wa-visually-hidden"> for {nameOf(change.key)}</span>
									</button>
								</div>
								{#if group !== 'notes' && group !== 'more-experience'}
									<span class="levels">{levelText(change)}</span>
								{/if}
								{#if expanded.has(toggleId(group, change))}
									<ol class="timeline">
										{#each timelineOf(change.key) as point (point.at)}
											<li>
												<span class="when">{labelOf(point.at)}</span>
												{answerText(change.key, point.answer)}
											</li>
										{/each}
									</ol>
								{/if}
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		{/each}
	{/if}
{/if}

<style>
	h1 {
		text-align: center;
	}

	h2 {
		margin: 1.25rem 0 0.5rem;
		font-size: 1.1rem;
	}

	.quiet {
		text-align: center;
		color: var(--wa-color-text-quiet);
	}

	.pick {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		margin-block: 1rem;

		wa-select {
			flex: 1 1 12rem;
		}
	}

	.versions,
	.changes,
	.timeline {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;

		/* Web Awesome's native styles indent every <li> for its marker. */
		li {
			margin: 0;
		}
	}

	.versions {
		color: var(--wa-color-text-quiet);
		font-size: 0.875rem;
	}

	.changes > li {
		display: flex;
		flex-direction: column;
		padding-block-end: 0.4rem;
		border-block-end: var(--wa-border-width-s) solid var(--wa-color-surface-border);
	}

	.row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem;
	}

	.name {
		font-weight: var(--wa-font-weight-semibold);
	}

	.part,
	.retired,
	.levels,
	.timeline {
		font-size: 0.875rem;
		color: var(--wa-color-text-quiet);
	}

	.retired {
		display: block;
		font-weight: var(--wa-font-weight-normal);
	}

	.toggle {
		font: inherit;
		font-size: 0.875rem;
		color: var(--wa-color-text-link);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
	}

	.timeline {
		margin-block-start: 0.4rem;
		padding-inline-start: 0.75rem;
		border-inline-start: var(--wa-border-width-m) solid var(--wa-color-surface-border);
	}

	.when {
		color: var(--wa-color-text-normal);
	}
</style>
