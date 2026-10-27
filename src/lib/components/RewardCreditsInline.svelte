<script lang="ts">
	import { prefersReducedMotion, Tween } from 'svelte/motion';
	import { enhance } from '$lib/enhance';

	type EditableCredit = {
		action: string;
		inputLabel: string;
		editLabel: string;
		saveLabel: string;
		cancelLabel: string;
		targetUserId?: string | null;
		targetUserIdField?: string;
		/** The space the balance is in, posted with it: a balance is one member's in one space. */
		spaceId?: string | null;
	};

	let {
		credits,
		label = null,
		unit = 'credits',
		editable = null,
		compact = false,
		showLabel = true
	}: {
		credits: number;
		label?: string | null;
		unit?: string | null;
		editable?: EditableCredit | null;
		compact?: boolean;
		showLabel?: boolean;
	} = $props();

	/**
	 * The balance counts to its new value rather than jumping, and bumps once
	 * in amber, when a claim, a completed task or an edit changes it while the
	 * page is open — so the number that moved is the one the eye goes to.
	 * Starts at the real value, so a page load shows no count-up.
	 */
	const shown = Tween.of(() => credits, {
		duration: () => (prefersReducedMotion.current ? 0 : 400)
	});
	const shownCredits = $derived(Math.round(shown.current));

	let bumped = $state(false);
	// Read once, as the value to compare the first change against; the effect
	// below keeps it current.
	// svelte-ignore state_referenced_locally
	let previous = credits;
	$effect(() => {
		if (credits === previous) {
			return;
		}
		previous = credits;
		bumped = true;
		const timer = setTimeout(() => {
			bumped = false;
		}, 600);
		return () => clearTimeout(timer);
	});

	let editing = $state(false);
	let draft = $state('');

	function startEditing() {
		draft = String(credits);
		editing = true;
	}

	function cancelEditing() {
		draft = String(credits);
		editing = false;
	}
</script>

{#if editable}
	<!--
		Enhanced, so saving stays on the page. As a plain POST it navigated to
		`?/selfSetCredits`, which then sat in history: a sheet closing back onto
		the list returned to that URL, and the balance jumped on a reload rather
		than counting to its new value.
	-->
	<form
		method="POST"
		action={editable.action}
		class="credit-shell"
		class:compact={compact}
		class:editing
		use:enhance={() =>
			async ({ result, update }) => {
				await update();
				if (result.type === 'success') {
					editing = false;
				}
			}}
	>
		{#if editable.targetUserId}
			<input
				type="hidden"
				name={editable.targetUserIdField ?? 'targetUserId'}
				value={editable.targetUserId}
			/>
		{/if}
		{#if editable.spaceId}<input type="hidden" name="spaceId" value={editable.spaceId} />{/if}

		{#if showLabel && label}<span class="credit-label">{label}</span>{/if}

		{#if editing}
			<input
				class="credit-input"
				type="number"
				min="0"
				step="1"
				name="credits"
				bind:value={draft}
				aria-label={editable.inputLabel}
			/>
			<div class="credit-actions">
				<wa-button type="submit" class="icon-button" appearance="plain" pill>
					<wa-icon name="check" variant="solid" label={editable.saveLabel}></wa-icon>
				</wa-button>
				<wa-button
					type="button"
					class="icon-button"
					appearance="plain"
					pill
					onclick={cancelEditing}
				>
					<wa-icon name="xmark" variant="solid" label={editable.cancelLabel}></wa-icon>
				</wa-button>
			</div>
		{:else}
			<div class="credit-display">
				<strong class={['credit-value', { bumped }]}>{shownCredits}</strong>
				{#if unit}<span class="credit-unit">{unit}</span>{/if}
				<wa-button type="button" class="icon-button" appearance="plain" pill onclick={startEditing}>
					<wa-icon name="pen-to-square" variant="solid" label={editable.editLabel}></wa-icon>
				</wa-button>
			</div>
		{/if}
	</form>
{:else}
	<div class="credit-shell" class:compact={compact}>
		{#if showLabel && label}<span class="credit-label">{label}</span>{/if}
		<div class="credit-display">
			<strong class={['credit-value', { bumped }]}>{shownCredits}</strong>
			{#if unit}<span class="credit-unit">{unit}</span>{/if}
		</div>
	</div>
{/if}

<style>
	.credit-shell,
	.credit-display,
	.credit-actions {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		flex-wrap: wrap;
	}

	/* On the baseline, so "Credits:" sits on the same line as the bigger
	   number beside it. Centred, the label rode high; on a phone, where this
	   was `stretch`, it sat at the top of the row. */
	.credit-shell,
	.credit-display {
		align-items: baseline;
	}

	.credit-shell {
		justify-content: space-between;
	}

	.credit-shell.compact {
		justify-content: flex-start;
		gap: 0.7rem;
		flex-wrap: nowrap;
	}

	.credit-shell.editing.compact {
		flex-wrap: wrap;
	}

	.credit-label,
	.credit-unit {
		color: var(--wa-color-text-quiet);
	}

	.credit-label {
		font-size: 0.95rem;
	}

	.credit-unit {
		font-size: 0.9rem;
	}

	.credit-value {
		font-size: clamp(1.25rem, 4vw, 2rem);
		line-height: 1;
	}

	.compact .credit-value {
		font-size: clamp(1rem, 3vw, 1.35rem);
	}

	@media (prefers-reduced-motion: no-preference) {
		.bumped {
			display: inline-block;
			animation: bump 600ms ease-out;
		}
	}

	@keyframes bump {
		35% {
			transform: scale(1.12);
			color: var(--wa-color-brand-on-quiet);
		}
	}

	.credit-input {
		width: min(8rem, 100%);
		box-sizing: border-box;
		padding: 0.6rem 0.75rem;
		border-radius: 0.6rem;
		border: 1px solid var(--wa-color-surface-border);
		font: inherit;
	}

	.credit-actions {
		flex-wrap: nowrap;
	}

	/* The same 2.25rem round target these had as native buttons. */
	.icon-button {
		--wa-form-control-height: 2.25rem;
		color: var(--wa-color-text-quiet);
		align-self: center;
	}

	@media (max-width: 640px) {
		.credit-display,
		.credit-actions {
			justify-content: flex-start;
		}

		.credit-shell.compact {
			flex-wrap: wrap;
		}
	}
</style>
