<script lang="ts">
	import type { SuperValidated } from 'sveltekit-superforms';
	import ResponsiveDialog from '$lib/components/ResponsiveDialog.svelte';
	import SavedNote from '$lib/components/SavedNote.svelte';
	import RadioButton from '$lib/components/segmented/RadioButton.svelte';
	import RadioButtonGroup from '$lib/components/segmented/RadioButtonGroup.svelte';
	import {
		ADULT_LEVELS,
		backoffUntil,
		type ProviderOverride,
		type ProviderState
	} from '$lib/model-providers';
	import type { ProviderOverrideForm } from '$lib/schemas/serverSettingsForms';
	import { superForm } from '$lib/superform';

	/**
	 * The story model's providers: what each passed of the adult-content
	 * check, its health in use, and the admin's override, with the button that
	 * runs the check (docs/server-settings.md, "Adult content by provider").
	 */
	let {
		model,
		providers,
		checkForm,
		overrideForm
	}: {
		model: string;
		providers: ProviderState[];
		checkForm: SuperValidated<Record<string, never>>;
		overrideForm: SuperValidated<ProviderOverrideForm>;
	} = $props();

	// svelte-ignore state_referenced_locally
	// Captured once on purpose: superForm registers once and its stores stay live.
	const check = superForm(checkForm, { invalidateAll: true });
	const { message: checkMessage, submitting: checking } = check;

	// svelte-ignore state_referenced_locally
	const override = superForm(overrideForm, {
		invalidateAll: true,
		onUpdated: ({ form }) => {
			if (form.valid) {
				dialog?.close();
			}
		}
	});
	const { form: overrideData, errors: overrideErrors, tainted: overrideTainted } = override;

	let editing = $state<string | null>(null);
	let dialog: ResponsiveDialog | undefined = $state();
	const now = $derived(new Date());

	const OVERRIDE_LABELS: Record<ProviderOverride, string> = {
		auto: 'Auto',
		always: 'Always use',
		never: 'Never use'
	};

	function levelLabel(state: ProviderState): string {
		if (state.levelPassed === null) {
			return 'Unchecked';
		}
		if (state.levelPassed === 0) {
			return 'Refuses adult content';
		}
		return ADULT_LEVELS.find((entry) => entry.level === state.levelPassed)?.label ?? '';
	}

	function time(date: Date): string {
		return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
	}

	function health(state: ProviderState): {
		label: string;
		variant: 'success' | 'warning' | 'neutral';
	} {
		const until = backoffUntil(state.health, now);
		if (until && state.health.refusalBackoffUntil?.getTime() === until.getTime()) {
			const count = state.health.refusalsInRow;
			return {
				label: `Skipped until ${time(until)} · ${count} refusal${count === 1 ? '' : 's'} in a row`,
				variant: 'warning'
			};
		}
		if (until) {
			return { label: `Errors · retried after ${time(until)}`, variant: 'warning' };
		}
		return state.checkedAt
			? { label: 'Healthy', variant: 'success' }
			: { label: 'Not checked', variant: 'neutral' };
	}

	function edit(state: ProviderState) {
		$overrideData = { provider: state.provider, override: state.override };
		editing = state.provider;
	}
</script>

<section class="provider-checks" aria-labelledby="provider-checks-heading">
	<h3 id="provider-checks-heading">Adult content by provider</h3>
	<p class="lead">
		Each provider serving <code>{model}</code> is asked four graded requests, from suggestive to consent-play
		fantasy, and the new daydream engine sends requests only to the providers that passed the most.
		A provider that starts refusing is skipped for a while, longer each time.
	</p>
	<form method="POST" action="?/checkProviders" use:check.enhance class="check">
		<wa-button type="submit" appearance="outlined" disabled={$checking}>
			{$checking ? 'Checking every provider…' : 'Check adult content'}
		</wa-button>
		{#if $checkMessage}<SavedNote>{$checkMessage}</SavedNote>{/if}
	</form>

	{#if providers.length > 0}
		<div class="table">
			<table>
				<thead>
					<tr><th>Provider</th><th>Adult content</th><th>Checked</th><th>Health</th><th>Override</th></tr>
				</thead>
				<tbody>
					{#each providers as state (state.provider)}
						<tr>
							<td><code>{state.provider}</code></td>
							<td>
								<span class="levels" aria-hidden="true">
									{#each ADULT_LEVELS as entry (entry.level)}
										<i class:passed={(state.levelPassed ?? 0) >= entry.level}></i>
									{/each}
								</span>
								{levelLabel(state)}
							</td>
							<td>{state.checkedAt ? state.checkedAt.toLocaleDateString() : '–'}</td>
							<td><wa-badge variant={health(state).variant}>{health(state).label}</wa-badge></td>
							<td>
								<wa-button size="s" appearance="plain" onclick={() => edit(state)}>
									{OVERRIDE_LABELS[state.override]}
								</wa-button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<p class="empty">Not checked yet. Until it is, no provider is known to allow adult content.</p>
	{/if}
</section>

{#if editing}
	<ResponsiveDialog
		bind:this={dialog}
		label={`Override for ${editing}`}
		onclose={() => {
			editing = null;
		}}
	>
		<form method="POST" action="?/setProviderOverride" use:override.enhance class="override">
			<input type="hidden" name="provider" value={$overrideData.provider} />
			<RadioButtonGroup label="Use this provider" name="override" bind:value={$overrideData.override}>
				<RadioButton value="auto">As its checks say</RadioButton>
				<RadioButton value="always">Always</RadioButton>
				<RadioButton value="never">Never</RadioButton>
			</RadioButtonGroup>
			{#if $overrideErrors.provider}<p class="error">{$overrideErrors.provider}</p>{/if}
			<!-- Outlined until there is a change to save (AGENTS.md, "Save buttons"). -->
			<wa-button
				type="submit"
				appearance={$overrideTainted ? 'accent' : 'outlined'}
				variant={$overrideTainted ? 'brand' : 'neutral'}
			>
				Save override
			</wa-button>
		</form>
	</ResponsiveDialog>
{/if}

<style>
	.provider-checks {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-s);
		margin-top: var(--wa-space-l);

		h3 {
			margin: 0;
			font-size: var(--wa-font-size-m);
		}
	}

	.lead,
	.empty {
		margin: 0;
		color: var(--wa-color-text-quiet);
	}

	.check,
	.override {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--wa-space-s);
	}

	.override {
		flex-direction: column;
		align-items: flex-start;
	}

	.table {
		overflow-x: auto;
	}

	table {
		border-collapse: collapse;
		width: 100%;
		font-size: var(--wa-font-size-s);

		th,
		td {
			text-align: start;
			padding: var(--wa-space-2xs) var(--wa-space-s);
			border-bottom: 1px solid var(--wa-color-surface-border);
			white-space: nowrap;
		}
	}

	.levels {
		display: inline-flex;
		gap: 3px;
		margin-inline-end: var(--wa-space-2xs);
		vertical-align: middle;

		i {
			width: 0.55rem;
			height: 0.55rem;
			border-radius: 50%;
			background: var(--wa-color-neutral-fill-quiet);
		}

		i.passed {
			background: var(--wa-color-success-fill-loud);
		}
	}

	.error {
		margin: 0;
		color: var(--wa-color-danger-on-quiet);
	}
</style>
