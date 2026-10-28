<script lang="ts">
	import { defaults } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { z } from 'zod';
	import ResponsiveDialog from '$lib/components/ResponsiveDialog.svelte';
	import SelectField from '$lib/components/SelectField.svelte';
	import { shownSpace } from '$lib/context-client.svelte';
	import type { NotebookKind } from '$lib/notebook';
	import { type SealScope, sealScopeForSpace } from '$lib/sealed-forms';
	import { superForm } from '$lib/superform';
	import type { ContextSpaceView } from '$lib/types';

	/**
	 * Moving an entry to another of the viewer's spaces (docs/notebook.md,
	 * "Moving an entry"). Says what the move does before it is made: who stops
	 * seeing it and who starts. The move itself is the session's
	 * (`NotebookSession.moveTo`); this only asks where to, and shows how far it
	 * has got.
	 *
	 * Mounted only while open, like every `ResponsiveDialog`.
	 */
	let {
		kind,
		currentSpaceId,
		spaces,
		partnerLabel,
		onmove,
		onclose
	}: {
		kind: NotebookKind;
		/** The space the entry is in now, which is not offered. */
		currentSpaceId: string;
		/** The switcher's spaces: every space the viewer is in. */
		spaces: readonly ContextSpaceView[];
		/** Who the entry is shared with now, for a shared entry; null for your own. */
		partnerLabel: string | null;
		onmove: (
			target: { scope: SealScope; spaceId: string },
			onProgress: (done: number, total: number) => void
		) => Promise<{ ok: true } | { ok: false; error: string }>;
		onclose: () => void;
	} = $props();

	let dialog: ResponsiveDialog | undefined = $state();

	const targets = $derived(spaces.filter((space) => space.id !== currentSpaceId));
	const current = $derived(spaces.find((space) => space.id === currentSpaceId) ?? null);

	const schema = z.object({ spaceId: z.string().min(1, 'Choose where it goes') });

	// svelte-ignore state_referenced_locally
	// Captured once, as every superform is: the stores are the live connection.
	// With only one place it could go, that one is already chosen.
	const superform = superForm(
		defaults({ spaceId: targets.length === 1 ? (targets[0]?.id ?? '') : '' }, zod4Client(schema), {
			id: 'move-entry'
		}),
		{
			SPA: true,
			resetForm: false,
			validators: zod4Client(schema)
		}
	);
	const { form } = superform;

	const options = $derived(
		targets.map((space) => ({
			value: space.id,
			label: shownSpace(space).name,
			colour: shownSpace(space).colour
		}))
	);

	const target = $derived(targets.find((space) => space.id === $form.spaceId) ?? null);

	const what = $derived(kind === 'journal' ? 'entry' : kind);

	/** What moving it there does, in a line or two. */
	const consequences = $derived.by(() => {
		if (!target) {
			return [];
		}
		const lines: string[] = [];
		if (partnerLabel) {
			lines.push(`${partnerLabel} won’t see this ${what} any more.`);
		}
		if (target.kind === 'shared') {
			lines.push(
				`${shownSpace(target).name} will see it, and all of its history, and can change it.`
			);
		} else {
			lines.push('It will be just for you.');
		}
		return lines;
	});

	let busy = $state(false);
	let progress = $state<{ done: number; total: number } | null>(null);
	let problem = $state<string | null>(null);

	async function move() {
		if (!target || busy) {
			return;
		}
		busy = true;
		problem = null;
		const result = await onmove(
			{ scope: sealScopeForSpace({ spaceId: target.id, kind: target.kind }), spaceId: target.id },
			(done, total) => {
				progress = { done, total };
			}
		);
		busy = false;
		progress = null;
		if (result.ok) {
			dialog?.close();
		} else {
			problem = result.error;
		}
	}
</script>

<ResponsiveDialog bind:this={dialog} label={`Move this ${what}`} {onclose} lightDismiss={!busy}>
	<p class="current">
		{#if partnerLabel}
			This {what} is currently shared with
			<span class="whose"
				>{#if current}<span class="dot" style:background={shownSpace(current).colour} aria-hidden="true"
					></span>{/if}{partnerLabel}</span
			>.
		{:else}
			This {what} is currently just for you.
		{/if}
	</p>
	<SelectField {superform} field="spaceId" title="Move it to" {options} placeholder="Choose where it goes" />
	{#each consequences as line (line)}
		<p class="consequence">{line}</p>
	{/each}
	{#if progress && progress.total > 1}
		<p class="quiet" role="status">Moving its history: {progress.done} of {progress.total}</p>
	{:else if busy}
		<p class="quiet" role="status">Moving…</p>
	{/if}
	{#if problem}
		<wa-callout variant="danger">
			<wa-icon slot="icon" name="triangle-exclamation"></wa-icon>
			{problem}
		</wa-callout>
	{/if}
	{#snippet footer()}
		<wa-button appearance="outlined" disabled={busy} onclick={() => dialog?.close()}>Cancel</wa-button>
		<wa-button
			variant="brand"
			appearance={target ? 'accent' : 'outlined'}
			disabled={!target || busy}
			onclick={move}
		>
			{busy ? 'Moving…' : 'Move'}
		</wa-button>
	{/snippet}
</ResponsiveDialog>

<style>
	.current {
		margin: 0 0 var(--wa-space-m);
	}

	/* The name with its space's dot before it, kept on one line. */
	.whose {
		white-space: nowrap;
	}

	/* The same dot as `SpaceChip`'s and the select's. */
	.dot {
		display: inline-block;
		inline-size: 0.5rem;
		block-size: 0.5rem;
		/* A little more before it than after: the word space before it, plus
		   this, so the dot sits with the name it belongs to. */
		margin-inline: 0.15em 0.3em;
		border-radius: 50%;
		vertical-align: 0.1em;
	}

	.consequence {
		margin: var(--wa-space-s) 0 0;
	}

	.quiet {
		margin: var(--wa-space-s) 0 0;
		color: var(--wa-color-text-quiet);
	}

	wa-callout {
		margin-block-start: var(--wa-space-m);
	}
</style>
