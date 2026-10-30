<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { resolve } from '$app/paths';
	import ModelChoice, { type ModelPresetOption } from '$lib/components/admin/ModelChoice.svelte';
	import ModelDetails from '$lib/components/admin/ModelDetails.svelte';
	import ModelProviderField from '$lib/components/admin/ModelProviderField.svelte';
	import ModelSearch from '$lib/components/admin/ModelSearch.svelte';
	import ProviderChecks from '$lib/components/admin/ProviderChecks.svelte';
	import ProviderKeyDialog from '$lib/components/admin/ProviderKeyDialog.svelte';
	import SecretSettingField from '$lib/components/admin/SecretSettingField.svelte';
	import VoiceSample from '$lib/components/dreams/VoiceSample.svelte';
	import InputField from '$lib/components/InputField.svelte';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import SavedNote from '$lib/components/SavedNote.svelte';
	import {
		imageModelSettingsFormSchema,
		languageModelSettingsFormSchema,
		mailSettingsFormSchema,
		pushSettingsFormSchema,
		voiceSettingsFormSchema
	} from '$lib/schemas/serverSettingsForms';
	import {
		FISH_VOICE_PRESETS,
		IMAGE_PROVIDERS,
		LANGUAGE_PROVIDERS,
		MODEL_PROVIDER_IDS,
		MODEL_PROVIDERS,
		type ModelProviderId,
		modelKindsOf,
		PICTURE_BASE_MODELS,
		PICTURE_MODEL_PRESETS,
		type ServerSettingKey,
		STORY_MODEL_PRESETS,
		VOICE_PROVIDERS
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
	const voiceForm = superForm(data.voiceForm, { resetForm: false });
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
		form: voices,
		message: voiceMessage,
		submitting: voiceSubmitting,
		tainted: voiceTainted,
		isTainted: voiceIsTainted
	} = voiceForm;
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
	const canSaveVoices = $derived(
		voiceIsTainted($voiceTainted) && voiceSettingsFormSchema.safeParse($voices).success
	);
	const canSavePush = $derived(
		pushIsTainted($pushTainted) && pushSettingsFormSchema.safeParse($push).success
	);

	/**
	 * Whether the provider says it has no model by a custom id. Only the
	 * saved value counts — an edit that is not saved yet changes nothing the
	 * server sends to — so the badge says "Model not found" rather than
	 * "Working" above a warning that stories sent to it would fail.
	 */
	let storyMissing = $state(false);
	let photoMissing = $state(false);
	let illustratedMissing = $state(false);
	const languageModelsBroken = $derived(
		storyMissing && !languageModelIsTainted($languageModelTainted)
	);
	const imageModelsBroken = $derived(
		(photoMissing || illustratedMissing) && !imageModelIsTainted($imageModelTainted)
	);

	/**
	 * Whether the story model as picked calls tools, which decides whether a
	 * research model is asked for: none of the presets do; a custom model
	 * does when OpenRouter lists it so, which `ModelChoice` hears once it has
	 * found the model, and the saved one is known from the load until then.
	 */
	let storyTools = $state<{ id: string; tools: boolean } | null>(null);
	const storyCallsTools = $derived.by(() => {
		if ($languageModels.storyModel !== 'custom') {
			return false;
		}
		const id = $languageModels.openrouterModelId.trim();
		if (storyTools?.id === id) {
			return storyTools.tools;
		}
		return id === data.languageModelForm.data.openrouterModelId && data.storyModelReadsLinks;
	});

	/**
	 * The page's sections, for the jump row at the top. The page is long —
	 * about eight screens on a phone — and each part has its own status, so
	 * the row is both a way down and the admin index's summary repeated.
	 * `ready` is null for a section with no status of its own.
	 */
	const sections = $derived([
		{ id: 'email', label: 'Email', ready: data.status.mailProblem === null },
		{ id: 'providers', label: 'Providers', ready: null },
		{
			id: 'language-models',
			label: 'Language',
			ready: data.status.languageModels && !languageModelsBroken
		},
		{ id: 'image-models', label: 'Image', ready: data.status.imageModels && !imageModelsBroken },
		{ id: 'voices', label: 'Voices', ready: data.status.voices },
		{ id: 'push', label: 'Notifications', ready: data.status.push },
		{ id: 'secret', label: 'Secret', ready: null }
	]);

	// Each model setting's presets are those of the provider it has chosen.
	const storyPresets: ModelPresetOption[] = $derived(
		STORY_MODEL_PRESETS[$languageModels.storyProvider].map((preset) => ({
			...preset,
			modelId: preset.openrouterModelId
		}))
	);
	const baseLabel = (id: string) => PICTURE_BASE_MODELS.find((base) => base.id === id)?.label ?? id;
	const picturePresets = (
		provider: (typeof IMAGE_PROVIDERS)[number],
		style: 'photo' | 'illustrated'
	): ModelPresetOption[] =>
		PICTURE_MODEL_PRESETS[provider][style].map((preset) => ({
			...preset,
			modelId: preset.runwareModelAir,
			baseLabel: baseLabel(preset.base)
		}));
	const voicePresets: ModelPresetOption[] = FISH_VOICE_PRESETS.map((preset) => ({
		...preset,
		modelId: preset.fishVoiceId
	}));
	const firstVoicePreset = () => FISH_VOICE_PRESETS[0].id;
	const photoPresets = $derived(picturePresets($imageModels.photoProvider, 'photo'));
	const illustratedPresets = $derived(
		picturePresets($imageModels.illustratedProvider, 'illustrated')
	);

	// ── model providers ──
	// One key per provider, in a dialog of its own, opened from the provider's
	// row or from a model setting whose provider has none yet.
	const providerDialogs: Partial<Record<ModelProviderId, { show: () => void }>> = $state({});

	function openProviderKey(provider: ModelProviderId) {
		providerDialogs[provider]?.show();
	}

	function providerKey(provider: ModelProviderId) {
		return data.secrets[MODEL_PROVIDERS[provider].credentialKey];
	}

	const keySet = (provider: ModelProviderId) => providerKey(provider).set;

	const KIND_LABELS = {
		language: 'Language models',
		image: 'Image models',
		voice: 'Voices'
	} as const;

	function kindsLabel(provider: ModelProviderId): string {
		return modelKindsOf(provider)
			.map((kind) => KIND_LABELS[kind])
			.join(' and ');
	}

	const firstStoryPreset = (provider: ModelProviderId) =>
		STORY_MODEL_PRESETS[provider as (typeof LANGUAGE_PROVIDERS)[number]][0]?.id ?? 'custom';
	const firstPicturePreset = (style: 'photo' | 'illustrated') => (provider: ModelProviderId) =>
		PICTURE_MODEL_PRESETS[provider as (typeof IMAGE_PROVIDERS)[number]][style][0]?.id ?? 'custom';

	const credentialKeys = MODEL_PROVIDER_IDS.map((id) => MODEL_PROVIDERS[id].credentialKey);

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
	/>

	<div class="content">
		<!-- What saving here affects, which a page that looks like every other
		     settings page would not otherwise say. -->
		<p class="scope">Saved for the whole server, not just for you.</p>
		<!-- Sticky inside the scrolling <main>, so it stays in reach all the
		     way down. In-page links, which need no `resolve()`. -->
		<nav class="jump" aria-label="Sections">
			{#each sections as section (section.id)}
				<a href="#{section.id}">
					{#if section.ready !== null}
						<wa-icon
							class:off={!section.ready}
							name={section.ready ? 'circle-check' : 'circle-exclamation'}
							variant="solid"
							label={section.ready ? 'working' : 'not set up'}
						></wa-icon>
					{/if}
					{section.label}
				</a>
			{/each}
		</nav>

		<!-- ── Email ─────────────────────────────────────────────────────── -->
		<article id="email" class="panel" aria-labelledby="email-heading">
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
					{#if $mailMessage}<SavedNote>{$mailMessage}</SavedNote>{/if}
					<wa-button
						type="submit"
						appearance={canSaveMail ? 'accent' : 'outlined'}
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
				{#if $testMessage}<SavedNote>{$testMessage}</SavedNote>{/if}
				{#if $testErrors._errors}<span class="invalid" role="alert">{$testErrors._errors}</span>{/if}
			</form>
		</article>

		<!-- ── Model providers ───────────────────────────────────────────── -->
		<!-- Credentials apart from models: a provider's key is the account with
		     it, shared by every model setting that chooses it. -->
		<article id="providers" class="panel" aria-labelledby="providers-heading">
			<header>
				<h2 id="providers-heading">Model providers</h2>
			</header>
			<p class="lead">
				The services the language and image models below run on. Each has one API key, used by
				every model that runs there, and every request is billed to it.
			</p>
			<ul class="providers">
				{#each MODEL_PROVIDER_IDS as provider (provider)}
					{const stored = $derived(providerKey(provider))}
					<li class="generated">
						<div class="value">
							<span class="label">{MODEL_PROVIDERS[provider].label}</span>
							<small>{kindsLabel(provider)}</small>
							<small class="key-state">
								{#if stored.set}
									<wa-icon name="key" variant="solid"></wa-icon>
									Key saved{#if stored.tail}, ending <code>…{stored.tail}</code>{/if}
								{:else}
									No key yet
								{/if}
							</small>
						</div>
						<wa-button size="s" appearance="outlined" onclick={() => openProviderKey(provider)}>
							{stored.set ? 'Change' : 'Add'}
							{MODEL_PROVIDERS[provider].label} key
						</wa-button>
					</li>
				{/each}
			</ul>
			{#if stillInEnv(...credentialKeys).length}
				{@render envNote(stillInEnv(...credentialKeys))}
			{/if}
		</article>

		<!-- ── Language models ───────────────────────────────────────────── -->
		<!-- Named for what the provider does rather than for Daydreams, its
		     first user: a later feature that writes text uses the same key,
		     with a model setting of its own here. -->
		<!-- One pair of words for every badge on the page, where there were three
		     ("Working", "On", "Off"): neutral where a part is optional, a
		     warning where something is wrong or the server needs it. -->
		<article id="language-models" class="panel" aria-labelledby="language-models-heading">
			<header>
				<h2 id="language-models-heading">Language models</h2>
				{#if languageModelsBroken}
					<wa-badge variant="warning">Model not found</wa-badge>
				{:else if data.status.languageModels}
					<wa-badge variant="success">Working</wa-badge>
				{:else}
					<wa-badge variant="neutral">Not set up</wa-badge>
				{/if}
			</header>
			<p class="lead">
				Text is written by chat models. Daydreams use them for their stories; without a key for
				the story model’s provider, Daydreams are off on this server.
			</p>
			<form method="POST" action="?/saveLanguageModels" use:languageModelForm.enhance>
				<ModelChoice
					superform={languageModelForm}
					choiceField="storyModel"
					idField="openrouterModelId"
					provider={$languageModels.storyProvider}
					legend="Daydreams story model"
					presets={storyPresets}
					onmissing={(missing) => {
						storyMissing = missing;
					}}
					ontools={(tools) => {
						storyTools = { id: $languageModels.openrouterModelId.trim(), tools };
					}}
				>
					{#snippet providerField()}
						<ModelProviderField
							superform={languageModelForm}
							field="storyProvider"
							choiceField="storyModel"
							idField="openrouterModelId"
							providers={LANGUAGE_PROVIDERS}
							firstPreset={firstStoryPreset}
							{keySet}
							onaddkey={openProviderKey}
						/>
					{/snippet}
				</ModelChoice>
				<!-- What is picked, as far as it is known: OpenRouter is asked again
				     whether the model calls tools when it is saved. -->
				{#if storyCallsTools}
					<p class="env-note">
						The story model calls tools, so it reads the links in a daydream’s brief and searches
						for a brief that asks for research.
					</p>
					<!-- Kept as it is while hidden: the form posts its fields, and a
					     missing one would clear it. -->
					<input type="hidden" name="researchModelId" value={$languageModels.researchModelId} />
				{:else}
					<fieldset class="research">
						<legend>Research model</legend>
						<p class="env-note">
							The story model isn’t known to call tools, so it can’t read the links in a brief
							or search for one. A model that does can research a brief first, and the story model
							writes from what it found. Optional: without one, links in a brief go as text.
						</p>
						<ModelSearch
							provider="openrouter"
							label="Search OpenRouter"
							onpick={(result) => {
								$languageModels.researchModelId = result.openrouterModelId;
							}}
						/>
						<InputField
							superform={languageModelForm}
							field="researchModelId"
							title="Research model ID"
							type="text"
							autocomplete="off"
							with-clear
							hint="Must call tools. Leave empty for none."
						/>
						<ModelDetails provider="openrouter" modelId={$languageModels.researchModelId} />
					</fieldset>
				{/if}
				{#if stillInEnv('storyModel').length}
					{@render envNote(stillInEnv('storyModel'))}
				{/if}
				<div class="actions">
					{#if $languageModelMessage}<SavedNote>{$languageModelMessage}</SavedNote>{/if}
					<wa-button
						type="submit"
						appearance={canSaveLanguageModels ? 'accent' : 'outlined'}
						variant={canSaveLanguageModels ? 'brand' : 'neutral'}
						disabled={$languageModelSubmitting}
					>
						Save language model settings
					</wa-button>
				</div>
			</form>
			<ProviderChecks
				model={data.storyModelListed}
				providers={data.storyProviders}
				checkForm={data.providerCheckForm}
				overrideForm={data.providerOverrideForm}
			/>
		</article>

		<!-- ── Image models ──────────────────────────────────────────────── -->
		<!-- Named for what the provider does, as the language models are. -->
		<article id="image-models" class="panel" aria-labelledby="image-models-heading">
			<header>
				<h2 id="image-models-heading">Image models</h2>
				{#if imageModelsBroken}
					<wa-badge variant="warning">Model not found</wa-badge>
				{:else if data.status.imageModels}
					<wa-badge variant="success">Working</wa-badge>
				{:else}
					<wa-badge variant="neutral">Not set up</wa-badge>
				{/if}
			</header>
			<p class="lead">
				Images are generated by image models. Daydreams use them for a picture beside each
				passage; without a key for each picture model’s provider, there are none.
			</p>
			<form method="POST" action="?/saveImageModels" use:imageModelForm.enhance>
				<ModelChoice
					superform={imageModelForm}
					choiceField="photoModel"
					idField="photoRunwareModelAir"
					baseField="photoBase"
					provider={$imageModels.photoProvider}
					legend="Daydreams photo model"
					presets={photoPresets}
					onmissing={(missing) => {
						photoMissing = missing;
					}}
				>
					{#snippet providerField()}
						<ModelProviderField
							superform={imageModelForm}
							field="photoProvider"
							choiceField="photoModel"
							idField="photoRunwareModelAir"
							baseField="photoBase"
							providers={IMAGE_PROVIDERS}
							firstPreset={firstPicturePreset('photo')}
							{keySet}
							onaddkey={openProviderKey}
						/>
					{/snippet}
				</ModelChoice>
				<ModelChoice
					superform={imageModelForm}
					choiceField="illustratedModel"
					idField="illustratedRunwareModelAir"
					baseField="illustratedBase"
					provider={$imageModels.illustratedProvider}
					legend="Daydreams illustration model"
					presets={illustratedPresets}
					onmissing={(missing) => {
						illustratedMissing = missing;
					}}
				>
					{#snippet providerField()}
						<ModelProviderField
							superform={imageModelForm}
							field="illustratedProvider"
							choiceField="illustratedModel"
							idField="illustratedRunwareModelAir"
							baseField="illustratedBase"
							providers={IMAGE_PROVIDERS}
							firstPreset={firstPicturePreset('illustrated')}
							{keySet}
							onaddkey={openProviderKey}
						/>
					{/snippet}
				</ModelChoice>
				{#if stillInEnv('photoModel', 'illustratedModel').length}
					{@render envNote(stillInEnv('photoModel', 'illustratedModel'))}
				{/if}
				<div class="actions">
					{#if $imageModelMessage}<SavedNote>{$imageModelMessage}</SavedNote>{/if}
					<wa-button
						type="submit"
						appearance={canSaveImageModels ? 'accent' : 'outlined'}
						variant={canSaveImageModels ? 'brand' : 'neutral'}
						disabled={$imageModelSubmitting}
					>
						Save image model settings
					</wa-button>
				</div>
			</form>
		</article>

		<!-- ── Voices ────────────────────────────────────────────────────── -->
		<article id="voices" class="panel" aria-labelledby="voices-heading">
			<header>
				<h2 id="voices-heading">Voices</h2>
				{#if data.status.voices}
					<wa-badge variant="success">Working</wa-badge>
				{:else}
					<wa-badge variant="neutral">Not set up</wa-badge>
				{/if}
			</header>
			<p class="lead">
				Daydreams can be read aloud, with a voice for the narrator and one matched to each
				character from the presets. Without a key for the voice provider, there is no reading aloud.
			</p>
			<form method="POST" action="?/saveVoices" use:voiceForm.enhance>
				<ModelChoice
					superform={voiceForm}
					choiceField="narratorVoice"
					idField="fishVoiceId"
					provider={$voices.voiceProvider}
					legend="Narrator voice"
					presets={voicePresets}
				>
					{#snippet besidePreset(preset)}
						<VoiceSample voice={preset.id} label={`Hear ${preset.label}`} />
					{/snippet}
					{#snippet providerField()}
						<ModelProviderField
							superform={voiceForm}
							field="voiceProvider"
							choiceField="narratorVoice"
							idField="fishVoiceId"
							providers={VOICE_PROVIDERS}
							firstPreset={firstVoicePreset}
							{keySet}
							onaddkey={openProviderKey}
						/>
					{/snippet}
				</ModelChoice>
				<InputField
					superform={voiceForm}
					field="voiceDailyCap"
					title="Daily limit per account, in characters"
					type="number"
					min="0"
					step="1000"
					hint="Speech is billed per character: Fish Audio charges $15 a million, so 30,000 is about 45¢ an account a day."
				/>
				<div class="actions">
					{#if $voiceMessage}<SavedNote>{$voiceMessage}</SavedNote>{/if}
					<wa-button
						type="submit"
						appearance={canSaveVoices ? 'accent' : 'outlined'}
						variant={canSaveVoices ? 'brand' : 'neutral'}
						disabled={$voiceSubmitting}
					>
						Save voice settings
					</wa-button>
				</div>
			</form>
		</article>

		<!-- ── Notifications ─────────────────────────────────────────────── -->
		<article id="push" class="panel" aria-labelledby="push-heading">
			<header>
				<h2 id="push-heading">Notifications</h2>
				{#if data.status.push}
					<wa-badge variant="success">Working</wa-badge>
				{:else}
					<wa-badge variant="warning">Not set up</wa-badge>
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
					{#if $pushMessage}<SavedNote>{$pushMessage}</SavedNote>{/if}
					<wa-button
						type="submit"
						appearance={canSavePush ? 'accent' : 'outlined'}
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
					{#if $vapidMessage}<SavedNote>{$vapidMessage}</SavedNote>{/if}
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
		<article id="secret" class="panel" aria-labelledby="secret-heading">
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

{#each MODEL_PROVIDER_IDS as provider (provider)}
	<ProviderKeyDialog
		bind:this={providerDialogs[provider]}
		data={data.providerForms[provider]}
		{provider}
		stored={providerKey(provider)}
	/>
{/each}

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
	}

	.scope {
		margin: 0;
		color: var(--wa-color-text-quiet);
	}

	.jump {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		gap: 0.25rem 0.5rem;
		/* One scrolling row on a phone rather than three wrapped ones. */
		overflow-x: auto;
		scrollbar-width: none;
		/* Pulled out to the column's edges so it covers what scrolls under it,
		   on an opaque surface: the wash behind is not opaque, and text
		   scrolling beneath showed through. */
		margin-inline: calc(-1 * var(--page-gutter));
		padding: var(--wa-space-xs) var(--page-gutter);
		background: var(--wa-color-surface-lowered);
		border-bottom: 1px solid var(--wa-color-surface-border);

		a {
			display: inline-flex;
			flex: none;
			align-items: center;
			gap: 0.35rem;
			min-block-size: 2.25rem;
			padding-inline: 0.6rem;
			border-radius: var(--wa-border-radius-pill);
			color: var(--wa-color-text-normal);
			font-size: var(--wa-font-size-s);
			text-decoration: none;

			&:hover,
			&:focus-visible {
				background: var(--wa-color-surface-raised);
			}
		}

		wa-icon {
			color: var(--wa-color-success-on-quiet);

			&.off {
				color: var(--wa-color-warning-on-quiet);
			}
		}
	}

	.panel {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem;
		border: 1px solid var(--wa-color-surface-border);
		border-radius: var(--wa-border-radius-l);
		/* Clear of the sticky jump row when one of its links scrolls here. */
		scroll-margin-top: 3.5rem;

		/* Less inset on a phone, where the gutter and the panel's padding
		   together left inputs a little over 270px wide and cut off a path. */
		@media (width < 40rem) {
			padding: var(--wa-space-m) var(--wa-space-s);
		}

		header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 0.5rem;
		}

		/* The size every settings subsection heading uses; Web Awesome's own h2
		   is page-sized. */
		h2 {
			margin: 0;
			font-size: var(--wa-font-size-l);
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

	.invalid {
		color: var(--wa-color-text-danger);
	}

	/* Its button right-aligned like every save on the page, also when it
	   wraps under the text on a phone. */
	.panel form.test {
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
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

	.providers {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin: 0;
		padding: 0;
		list-style: none;

		.key-state {
			display: inline-flex;
			align-items: center;
			gap: 0.4rem;
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

	.research {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
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

	.dialog-buttons {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>
