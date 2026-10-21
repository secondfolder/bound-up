<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import InputField from '$lib/components/InputField.svelte';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import SavedNote from '$lib/components/SavedNote.svelte';
	import TimezoneSelect from '$lib/components/TimezoneSelect.svelte';
	import { accountFormSchema } from '$lib/schemas/accountForm';
	import { superForm } from '$lib/superform';
	import { currentTimeZoneOrUtc } from '$lib/timezone';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let ready = $state(false);
	let deviceTimezone = $state('UTC');
	const backHref = resolve('/(auth-required)/(app)/settings');
	const user = $derived(page.data.user);

	onMount(() => {
		ready = true;
		deviceTimezone = currentTimeZoneOrUtc();
	});

	// svelte-ignore state_referenced_locally
	// Captures the load's initial `data.accountForm` on purpose: `superForm`
	// registers its lifecycle once, and re-running it on every `invalidate()`
	// would reset the form. `resetForm: false` keeps a failed submit populated.
	const superform = superForm(data.accountForm, {
		resetForm: false,
		async onUpdated({ form }) {
			if (!form.valid) {
				return;
			}
			saved = true;
			await invalidateAll();
		}
	});
	const { errors, form: values, isTainted, submitting, tainted } = superform;
	const hasUnsavedChanges = $derived(isTainted($tainted));
	// Solid only when there is something valid to save (AGENTS.md): a change
	// that would only be refused stays outlined, like no change at all.
	const canSave = $derived(hasUnsavedChanges && accountFormSchema.safeParse($values).success);
	// From a save that landed until the next edit.
	let saved = $state(false);
	$effect(() => {
		if (hasUnsavedChanges) {
			saved = false;
		}
	});
</script>

<section>
	<NestedPageHeader
		{backHref}
		backLabel="Back to settings"
		backText="Settings"
		title="Account"
		description="Update the name and timezone used on this account, and review the sign-in details attached to it."
	/>

	<div class="content">
		<form
			method="POST"
			action="?/update"
			use:superform.enhance
			data-ready={ready ? 'true' : undefined}
		>
			<InputField {superform} field="name" title="Name" type="text" autocomplete="name" />
			<TimezoneSelect {superform} field="timezone" title="Timezone" {deviceTimezone} />

			<div class="actions">
				<wa-button
					type="submit"
					appearance={canSave ? 'accent' : 'outlined'}
					variant={canSave ? 'brand' : undefined}
					disabled={$submitting}
				>
					Save account details
				</wa-button>
				{#if saved}<SavedNote />{/if}
			</div>
			{#if $errors._errors}<span class="invalid">{$errors._errors}</span>{/if}
		</form>

		{#if user}
			<div class="email-panel">
				<h2>Email</h2>
				<p class="value">{user.email}</p>
				<!-- Says nothing about why: the reason is how sign-in and its keys are
				     tied to the address, and encryption is never something people are
				     asked to think about (AGENTS.md). -->
				<p>Email changes are not available yet. This is the address you sign in with.</p>
			</div>
		{/if}

		<div class="linked-setting">
			<h2>Password and sign-in</h2>
			<p>Change your password, manage passkeys, and review sign-in settings from Security.</p>
			<a href={resolve('/(auth-required)/(app)/settings/security')}>Open security settings</a>
		</div>
	</div>
</section>

<style>
	section {
		max-width: var(--page-width-narrow);
		margin: 0 auto;
		width: 100%;
		padding-bottom: var(--wa-space-l);

		.content {
			display: flex;
			flex-direction: column;
			gap: 1rem;
			padding: var(--wa-space-l) var(--page-gutter);
		}

		h2,
		p {
			margin: 0;
		}

		/* A card's title, the size every settings subsection uses; Web
		   Awesome's own h2 is a page-sized 2xl, which wrapped "Password and
		   sign-in" onto two lines on a phone. */
		h2 {
			font-size: var(--wa-font-size-l);
		}

		.actions {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: 0.75rem;

			/* Full width on a phone, where it is a thumb's target; its own width
			   on anything wider, where a 600px bar shouted. */
			@media (width < 40rem) {
				wa-button {
					flex: 1 1 100%;
				}
			}
		}

		.email-panel p,
		.linked-setting p {
			color: var(--wa-color-text-quiet);
		}

		form {
			display: flex;
			flex-direction: column;
			gap: 1rem;
		}

		.email-panel,
		.linked-setting {
			display: flex;
			flex-direction: column;
			gap: 0.5rem;
			padding: 1rem;
			border: 1px solid var(--wa-color-surface-border);
			border-radius: var(--wa-border-radius-l);
			background: var(--wa-color-surface-raised);
		}

		.email-panel {
			.value {
				font-weight: var(--wa-font-weight-semibold, 600);
				color: var(--wa-color-text-normal);
				overflow-wrap: break-word;
			}
		}

		.invalid {
			color: var(--wa-color-text-danger);
		}
	}
</style>
