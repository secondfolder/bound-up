<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { resolve } from '$app/paths';
	import ModelChoice, { type ModelPresetOption } from '$lib/components/admin/ModelChoice.svelte';
	import SecretSettingField from '$lib/components/admin/SecretSettingField.svelte';
	import InputField from '$lib/components/InputField.svelte';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import {
		imageModelSettingsFormSchema,
		languageModelSettingsFormSchema,
		mailSettingsFormSchema,
		pushSettingsFormSchema
	} from '$lib/schemas/serverSettingsForms';
	import {
		OPENROUTER_STORY_MODEL_PRESETS,
		PICTURE_BASE_MODELS,
		RUNWARE_PICTURE_MODEL_PRESETS,
		type ServerSettingKey
	} from '$lib/server-settings';
	import { superForm } from '$lib/superform';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const backHref = resolve('/(auth-required)/(app)/admin');

	// svelte-ignore state_referenced_locally
	// Every form captures the load's initial data on purpose: `superForm`
	// registers its lifecycle once, and re-running it on every `invalidate()`
	// would reset it. `resetForm: false` because each action hands back the
	// saved values itself, with any typed credential cleared.
	const mailForm = superForm(data.mailForm, { resetForm: false });
	// svelte-ignore state_referenced_locally
	const testEmailForm = superForm(data.testEmailForm);
	// svelte-ignore state_referenced_locally
	const languageModelForm = superForm(data.languageModelForm, { resetForm: false });
	// svelte-ignore state_referenced_locally
	const imageModelForm = superForm(data.imageModelForm, { resetForm: false });
	// svelte-ignore state_referenced_locally
	const pushForm = superForm(data.pushForm, { resetForm: false });
	// svelte-ignore state_referenced_locally
	const vapidForm = superForm(data.vapidForm);
	// svelte-ignore state_referenced_locally
	const serverSecretForm = superForm(data.serverSecretForm);

	const {
		form: mail,
		errors: mailErrors,
		message: mailMessage,
		submitting: mailSubmitting,
		tainted: mailTainted,
		isTainted: mailIsTainted
	} = mailForm;
	const { errors: testErrors, message: testMessage, submitting: testSubmitting } = testEmailForm;
	const {
		form: languageModels,
		message: languageModelMessage,
		submitting: languageModelSubmitting,
		tainted: languageModelTainted,
		isTainted: languageModelIsTainted
	} = languageModelForm;
	const {
		form: imageModels,
		message: imageModelMessage,
		submitting: imageModelSubmitting,
		tainted: imageModelTainted,
		isTainted: imageModelIsTainted
	} = imageModelForm;
	const {
		form: push,
		message: pushMessage,
		submitting: pushSubmitting,
		tainted: pushTainted,
		isTainted: pushIsTainted
	} = pushForm;
	const { message: vapidMessage, submitting: vapidSubmitting } = vapidForm;
	const { submitting: serverSecretSubmitting } = serverSecretForm;

	// A save button is outlined until there is something valid to save
	// (AGENTS.md), keyed off superforms' own idea of "unsaved changes".
	const canSaveMail = $derived(
		mailIsTainted($mailTainted) && mailSettingsFormSchema.safeParse($mail).success
	);
	const canSaveLanguageModels = $derived(
		languageModelIsTainted($languageModelTainted) &&
			languageModelSettingsFormSchema.safeParse($languageModels).success
	);
	const canSaveImageModels = $derived(
		imageModelIsTainted($imageModelTainted) &&
			imageModelSettingsFormSchema.safeParse($imageModels).success
	);
	const canSavePush = $derived(
		pushIsTainted($pushTainted) && pushSettingsFormSchema.safeParse($push).success
	);

	const storyPresets: ModelPresetOption[] = OPENROUTER_STORY_MODEL_PRESETS.map((preset) => ({
		...preset,
		modelId: preset.openrouterModelId
	}));
	const baseLabel = (id: string) => PICTURE_BASE_MODELS.find((base) => base.id === id)?.label ?? id;
	const photoPresets: ModelPresetOption[] = RUNWARE_PICTURE_MODEL_PRESETS.photo.map((preset) => ({
		...preset,
		modelId: preset.runwareModelAir,
		baseLabel: baseLabel(preset.base)
	}));
	const illustratedPresets: ModelPresetOption[] = RUNWARE_PICTURE_MODEL_PRESETS.illustrated.map(
		(preset) => ({ ...preset, modelId: preset.runwareModelAir, baseLabel: baseLabel(preset.base) })
	);

	const TRANSPORTS = [
		{
			value: 'resend',
			label: 'Resend',
			description: 'An email API. Works everywhere, Cloudflare Workers included.',
			nodeOnly: false
		},
		{
			value: 'smtp',
			label: 'An SMTP server',
			description: 'Your own mail server, or any provider’s SMTP relay.',
			nodeOnly: true
		},
		{
			value: 'outbox',
			label: 'Files on this server',
			description: 'Nothing is sent: each email is written to a folder. For testing.',
			nodeOnly: true
		}
	] as const;

	/** SMTP and files need a Node build; on Workers they are shown, with why not. */
	function unavailable(transport: (typeof TRANSPORTS)[number]): boolean {
		return transport.nodeOnly && !data.nodeTarget;
	}

	function chooseTransport(value: (typeof TRANSPORTS)[number]['value']) {
		$mail.mailTransport = value;
	}

	const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

	function origin(source: string, updatedAt: Date | null): string {
		const when = updatedAt ? ` on ${dateFormat.format(updatedAt)}` : '';
		if (source === 'imported') {
			return `Carried over from the server’s environment${when}.`;
		}
		return source === 'admin' ? `Set by an admin${when}.` : `Made automatically${when}.`;
	}

	// TEMPORARY, with `legacy-env.ts`: the old variables still set for a setting.
	function stillInEnv(...keys: ServerSettingKey[]): string[] {
		return [...new Set(keys.flatMap((key) => data.legacyEnv[key] ?? []))];
	}

	/** The two confirmations, opened from their buttons. */
	let vapidDialog: (HTMLElement & { open: boolean }) | undefined = $state();
	let serverSecretDialog: (HTMLElement & { open: boolean }) | undefined = $state();

	function setOpen(dialog: (HTMLElement & { open: boolean }) | undefined, open: boolean) {
		if (dialog) {
			dialog.open = open;
		}
	}

	/** Closes the VAPID dialog once its action has answered, whichever way. */
	const closeOnResult: Attachment<HTMLElement> = () =>
		vapidMessage.subscribe((value) => {
			if (value && vapidDialog) {
				vapidDialog.open = false;
			}
		});
</script>

<section>
	<NestedPageHeader
		{backHref}
		backLabel="Back to admin"
		backText="Admin"
		title="Server settings"
		description="What this server needs to send email, generate text and images. Saved for the whole server, not just for you."
	/>

	<div class="content">
		<!-- ── Email ─────────────────────────────────────────────────────── -->
		<article class="panel" aria-labelledby="email-heading">
			<header>
				<h2 id="email-heading">Email</h2>
				{#if data.status.mailProblem === null}
					<wa-badge variant="success">Working</wa-badge>
				{:else}
					<wa-badge variant="warning">Not set up</wa-badge>
				{/if}
			</header>
			<p class="lead">
				New accounts confirm their address by email, and partner-assisted sign-in sends a link
				too.
				{#if data.status.mailDevDefault}
					Nothing is set, so under <code>vite dev</code> email is written to
					<code>.mail-outbox</code>.
				{:else if data.status.mailProblem}
					{data.status.mailProblem.replace(/ Set it up in .*$/, '')}
				{/if}
			</p>

			<form method="POST" action="?/saveMail" use:mailForm.enhance>
				<InputField
					superform={mailForm}
					field="mailFrom"
					required={false}
					title="Sent from"
					type="text"
					placeholder="Bound Up <hello@example.com>"
					hint="An address your provider lets you send from, with a name if you like."
					autocomplete="off"
				/>

				<fieldset class="transports">
					<legend>How it is sent</legend>
					{#each TRANSPORTS as transport (transport.value)}
						<label class="option" class:unavailable={unavailable(transport)}>
							<input
								type="radio"
								name="mailTransport"
								value={transport.value}
								checked={$mail.mailTransport === transport.value}
								disabled={unavailable(transport)}
								onchange={() => chooseTransport(transport.value)}
							/>
							<span class="text">
								<span class="label">{transport.label}</span>
								<small>
									{unavailable(transport)
										? 'Not on Cloudflare Workers, which cannot open mail connections or write files.'
										: transport.description}
								</small>
							</span>
						</label>
					{/each}
					{#if $mailErrors.mailTransport}<span class="invalid">{$mailErrors.mailTransport}</span>{/if}
				</fieldset>

				{#if $mail.mailTransport === 'resend'}
					<SecretSettingField
						superform={mailForm}
						field="resendApiKey"
						changeField="resendApiKeyChange"
						label="Resend API key"
						stored={data.secrets.resendApiKey}
						hint="From resend.com → API Keys. It needs permission to send."
						placeholder="re_…"
					/>
				{:else if $mail.mailTransport === 'smtp'}
					<SecretSettingField
						superform={mailForm}
						field="smtpUrl"
						changeField="smtpUrlChange"
						label="SMTP server"
						stored={data.secrets.smtpUrl}
						hint="As a URL, with the login in it: smtps://user:password@mail.example.com:465"
						placeholder="smtps://…"
					/>
				{:else if $mail.mailTransport === 'outbox'}
					<InputField
						superform={mailForm}
						field="mailOutboxDir"
						title="Folder"
						type="text"
						placeholder="./.mail-outbox"
						hint="On this server. Each email becomes a JSON file in it."
						autocomplete="off"
					/>
				{/if}

				{#if stillInEnv('mailFrom', 'mailTransport', 'resendApiKey', 'smtpUrl', 'mailOutboxDir').length}
					{@render envNote(
						stillInEnv('mailFrom', 'mailTransport', 'resendApiKey', 'smtpUrl', 'mailOutboxDir')
					)}
				{/if}

				<div class="actions">
					{#if $mailMessage}<span class="saved" role="status">{$mailMessage}</span>{/if}
					<wa-button
						type="submit"
						appearance={canSaveMail ? 'filled' : 'outlined'}
						variant={canSaveMail ? 'brand' : 'neutral'}
						disabled={$mailSubmitting}
					>
						Save email settings
					</wa-button>
				</div>
			</form>

			<form class="test" method="POST" action="?/testEmail" use:testEmailForm.enhance>
				<span>
					Send a test email to <strong>{data.adminEmail}</strong>, using what is saved.
				</span>
				<wa-button
					type="submit"
					appearance="outlined"
					size="s"
					disabled={$testSubmitting || data.status.mailProblem !== null}
				>
					Send a test email
				</wa-button>
				{#if $testMessage}<span class="saved" role="status">{$testMessage}</span>{/if}
				{#if $testErrors._errors}<span class="invalid" role="alert">{$testErrors._errors}</span>{/if}
			</form>
		</article>

		<!-- ── Language models ───────────────────────────────────────────── -->
		<!-- Named for what the provider does rather than for Daydreams, its
		     first user: a later feature that writes text uses the same key,
		     with a model setting of its own here. -->
		<article class="panel" aria-labelledby="language-models-heading">
			<header>
				<h2 id="language-models-heading">Language models</h2>
				{#if data.status.languageModels}
					<wa-badge variant="success">On</wa-badge>
				{:else}
					<wa-badge variant="neutral">Off</wa-badge>
				{/if}
			</header>
			<p class="lead">
				Text is written by chat models on OpenRouter, and every request is billed to this key.
				Daydreams use them for their stories; without a key, Daydreams are off on this server.
			</p>
			<form method="POST" action="?/saveLanguageModels" use:languageModelForm.enhance>
				<SecretSettingField
					superform={languageModelForm}
					field="openrouterApiKey"
					changeField="openrouterApiKeyChange"
					label="OpenRouter API key"
					stored={data.secrets.openrouterApiKey}
					hint="From openrouter.ai → Keys. Setting a credit limit on it is a good idea."
					placeholder="sk-or-…"
				/>
				<ModelChoice
					superform={languageModelForm}
					choiceField="storyModel"
					idField="openrouterModelId"
					provider="openrouter"
					legend="Daydreams story model"
					presets={storyPresets}
				/>
				<!-- What is stored, not what is picked: OpenRouter is asked whether
				     the model calls tools when it is saved. Worded without "saved",
				     which the panel's stored-credential badge is found by. -->
				<p class="env-note">
					{#if data.storyModelReadsLinks}
						The story model calls tools, so it reads the links in a daydream’s brief.
					{:else}
						The story model isn’t known to call tools, so links in a daydream’s brief go as text.
						A custom model reads them if OpenRouter lists it as calling tools; it is checked as
						it is stored.
					{/if}
				</p>
				{#if stillInEnv('openrouterApiKey', 'openrouterStoryModel').length}
					{@render envNote(stillInEnv('openrouterApiKey', 'openrouterStoryModel'))}
				{/if}
				<div class="actions">
					{#if $languageModelMessage}<span class="saved" role="status">{$languageModelMessage}</span>{/if}
					<wa-button
						type="submit"
						appearance={canSaveLanguageModels ? 'filled' : 'outlined'}
						variant={canSaveLanguageModels ? 'brand' : 'neutral'}
						disabled={$languageModelSubmitting}
					>
						Save language model settings
					</wa-button>
				</div>
			</form>
		</article>

		<!-- ── Image models ──────────────────────────────────────────────── -->
		<!-- Named for what the provider does, as the language models are. -->
		<article class="panel" aria-labelledby="image-models-heading">
			<header>
				<h2 id="image-models-heading">Image models</h2>
				{#if data.status.imageModels}
					<wa-badge variant="success">On</wa-badge>
				{:else}
					<wa-badge variant="neutral">Off</wa-badge>
				{/if}
			</header>
			<p class="lead">
				Images are generated by models on Runware, and every one is billed to this key. Daydreams
				use them for a picture beside each passage; without a key, there are none.
			</p>
			<form method="POST" action="?/saveImageModels" use:imageModelForm.enhance>
				<SecretSettingField
					superform={imageModelForm}
					field="runwareApiKey"
					changeField="runwareApiKeyChange"
					label="Runware API key"
					stored={data.secrets.runwareApiKey}
					hint="From runware.ai → API Keys. Searching for a custom model needs it saved first."
				/>
				<ModelChoice
					superform={imageModelForm}
					choiceField="photoModel"
					idField="photoRunwareModelAir"
					baseField="photoBase"
					provider="runware"
					legend="Daydreams photo model"
					presets={photoPresets}
				/>
				<ModelChoice
					superform={imageModelForm}
					choiceField="illustratedModel"
					idField="illustratedRunwareModelAir"
					baseField="illustratedBase"
					provider="runware"
					legend="Daydreams illustration model"
					presets={illustratedPresets}
				/>
				{#if stillInEnv('runwareApiKey', 'runwarePhotoModel', 'runwareIllustratedModel').length}
					{@render envNote(
						stillInEnv('runwareApiKey', 'runwarePhotoModel', 'runwareIllustratedModel')
					)}
				{/if}
				<div class="actions">
					{#if $imageModelMessage}<span class="saved" role="status">{$imageModelMessage}</span>{/if}
					<wa-button
						type="submit"
						appearance={canSaveImageModels ? 'filled' : 'outlined'}
						variant={canSaveImageModels ? 'brand' : 'neutral'}
						disabled={$imageModelSubmitting}
					>
						Save image model settings
					</wa-button>
				</div>
			</form>
		</article>

		<!-- ── Notifications ─────────────────────────────────────────────── -->
		<article class="panel" aria-labelledby="push-heading">
			<header>
				<h2 id="push-heading">Notifications</h2>
				{#if data.status.push}
					<wa-badge variant="success">Working</wa-badge>
				{:else}
					<wa-badge variant="warning">Off</wa-badge>
				{/if}
			</header>
			<p class="lead">
				Push notifications are signed with this server’s own key pair, made for it automatically.
				Apple, Google and Mozilla are told a contact address with each one.
			</p>
			<form method="POST" action="?/savePush" use:pushForm.enhance>
				<InputField
					superform={pushForm}
					field="vapidSubject"
					required={false}
					title="Contact address"
					type="text"
					placeholder={data.vapid.defaultSubject || 'mailto:you@example.com'}
					hint={data.vapid.defaultSubject
						? `Leave it empty to use ${data.vapid.defaultSubject}, from the email settings.`
						: 'Needed until email is set up, whose address is used otherwise.'}
					autocomplete="off"
				/>
				<div class="actions">
					{#if $pushMessage}<span class="saved" role="status">{$pushMessage}</span>{/if}
					<wa-button
						type="submit"
						appearance={canSavePush ? 'filled' : 'outlined'}
						variant={canSavePush ? 'brand' : 'neutral'}
						disabled={$pushSubmitting}
					>
						Save notification settings
					</wa-button>
				</div>
			</form>
			<div class="generated">
				<div class="value">
					<span class="label">Public key</span>
					<code class="key">{data.vapid.publicKey}</code>
					<small>{origin(data.vapid.source, data.vapid.updatedAt)}</small>
					{#if $vapidMessage}<span class="saved" role="status">{$vapidMessage}</span>{/if}
				</div>
				<wa-button
					appearance="outlined"
					variant="danger"
					size="s"
					onclick={() => setOpen(vapidDialog, true)}
				>
					<wa-icon slot="start" name="rotate" variant="solid"></wa-icon>
					Regenerate
				</wa-button>
			</div>
			{#if stillInEnv('vapidPublicKey', 'vapidPrivateKey', 'vapidSubject').length}
				{@render envNote(stillInEnv('vapidPublicKey', 'vapidPrivateKey', 'vapidSubject'))}
			{/if}
		</article>

		<!-- ── Server secret ─────────────────────────────────────────────── -->
		<article class="panel" aria-labelledby="secret-heading">
			<header>
				<h2 id="secret-heading">Server secret</h2>
			</header>
			<p class="lead">
				Signs every session and every shared IQ test result, and keys the server’s half of
				partner-assisted sign-in. Made for this server automatically, and never shown.
			</p>
			<div class="generated">
				<div class="value">
					<span class="label">Server secret</span>
					<small>{origin(data.serverSecret.source, data.serverSecret.updatedAt)}</small>
				</div>
				<wa-button
					appearance="outlined"
					variant="danger"
					size="s"
					onclick={() => setOpen(serverSecretDialog, true)}
				>
					<wa-icon slot="start" name="rotate" variant="solid"></wa-icon>
					Regenerate
				</wa-button>
			</div>
			{#if stillInEnv('serverSecret').length}
				{@render envNote(stillInEnv('serverSecret'))}
			{/if}
		</article>
	</div>
</section>

<wa-dialog bind:this={vapidDialog} label="Regenerate the notification keys?">
	<p>
		Every device that has notifications on stops getting them, and has to turn them on again in
		its settings. Use this if the private key may have leaked.
	</p>
	<form method="POST" action="?/regenerateVapid" use:vapidForm.enhance {@attach closeOnResult}>
		<div class="dialog-buttons">
			<wa-button appearance="plain" onclick={() => setOpen(vapidDialog, false)}
				>Cancel</wa-button
			>
			<wa-button type="submit" variant="danger" disabled={$vapidSubmitting}
				>Regenerate the keys</wa-button
			>
		</div>
	</form>
</wa-dialog>

<wa-dialog bind:this={serverSecretDialog} label="Regenerate the server secret?">
	<p>Use this if the secret may have leaked. Straight away:</p>
	<ul>
		<li>Everyone is signed out, you included.</li>
		<li>Each person's partner-assisted sign-in stops working until they next open the app.</li>
		<li>Links to IQ test results shared from a signed-out device stop opening.</li>
	</ul>
	<form method="POST" action="?/regenerateServerSecret" use:serverSecretForm.enhance>
		<div class="dialog-buttons">
			<wa-button
				appearance="plain"
				onclick={() => setOpen(serverSecretDialog, false)}>Cancel</wa-button
			>
			<wa-button type="submit" variant="danger" disabled={$serverSecretSubmitting}
				>Sign everyone out and regenerate</wa-button
			>
		</div>
	</form>
</wa-dialog>

<!-- TEMPORARY, with `legacy-env.ts`: says when an old variable can go. -->
{#snippet envNote(names: string[])}
	<p class="env-note">
		<wa-icon name="circle-info" variant="solid"></wa-icon>
		<span>
			{names.join(', ')}
			{names.length === 1 ? 'is' : 'are'} still set in this server’s environment, and ignored: the value
			was copied in once. Remove {names.length === 1 ? 'it' : 'them'}.
		</span>
	</p>
{/snippet}

<style>
	section {
		max-width: 40rem;
		margin: 0 auto;
		width: 100%;
		padding-bottom: var(--wa-space-l);

		.content {
			display: flex;
			flex-direction: column;
			gap: 1rem;
			padding: var(--wa-space-l);
		}
	}

	.panel {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem;
		border: 1px solid var(--wa-color-surface-border);
		border-radius: var(--wa-border-radius-l);

		header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 0.5rem;
		}

		h2 {
			margin: 0;
		}

		.lead {
			margin: 0;
			color: var(--wa-color-text-quiet);
		}

		form {
			display: flex;
			flex-direction: column;
			gap: 1rem;
		}
	}

	.transports {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;

		legend {
			margin-bottom: 0.5rem;
			padding: 0;
			font-weight: var(--wa-font-weight-semibold);
		}
	}

	.option {
		display: flex;
		box-sizing: border-box;
		width: 100%;
		align-items: flex-start;
		gap: 0.6rem;
		padding: 0.65rem 0.75rem;
		border: 1px solid var(--wa-color-surface-border);
		border-radius: var(--wa-border-radius-m);
		cursor: pointer;

		&:has(input:checked) {
			border-color: var(--wa-color-brand-border-loud);
			background: var(--wa-color-brand-fill-quiet);
		}

		&.unavailable {
			cursor: not-allowed;
			opacity: 0.6;
		}

		input {
			margin-top: 0.25rem;
			accent-color: var(--wa-color-brand-fill-loud);
		}

		.text {
			display: flex;
			flex-direction: column;
			gap: 0.15rem;
		}

		small {
			color: var(--wa-color-text-quiet);
		}
	}

	.actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.75rem;
	}

	.saved {
		color: var(--wa-color-success-on-quiet);
	}

	.invalid {
		color: var(--wa-color-text-danger);
	}

	.panel form.test {
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.75rem;
		padding-top: 1rem;
		border-top: 1px solid var(--wa-color-surface-border);

		> span:first-child {
			flex: 1 1 14rem;
			color: var(--wa-color-text-quiet);
		}
	}

	.generated {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;

		.value {
			display: flex;
			flex-direction: column;
			gap: 0.25rem;
			flex: 1 1 auto;
			min-width: 0;
		}

		.label {
			font-weight: var(--wa-font-weight-semibold);
		}

		.key {
			overflow-wrap: anywhere;
			font-size: var(--wa-font-size-s);
		}

		small {
			color: var(--wa-color-text-quiet);
		}
	}

	.env-note {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		margin: 0;
		color: var(--wa-color-text-quiet);
		font-size: var(--wa-font-size-s);

		wa-icon {
			margin-top: 0.2rem;
		}
	}

	.dialog-buttons {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>
