<script lang="ts">
	import { answeredCount, LEVEL_LABELS, type Level } from '$lib/kink-list/answers';
	import { kinkById } from '$lib/kink-list/catalog';
	import { kinkListContext } from '$lib/kink-list/context';
	import {
		exportCsv,
		exportJson,
		importCsv,
		importList,
		readExportJson
	} from '$lib/kink-list/import/files';
	import {
		detectKinklistLink,
		importKinklistLink,
		type ListSourceId
	} from '$lib/kink-list/import/kinklist-links';
	import { applyImport, type ImportedAnswer, type ImportResult } from '$lib/kink-list/import/result';
	import { decodeShareLink } from '$lib/kink-list/share-link';
	import KinkListCrumbs from './KinkListCrumbs.svelte';
	import SaveStatus from './SaveStatus.svelte';

	/**
	 * Getting a list in and out (docs/kink-list.md, "Import and export").
	 *
	 * Out: a JSON file with everything, exactly, or a spreadsheet anyone can
	 * read. In: a link (ours, or from the KinkList family of sites) or a file
	 * (ours, or any spreadsheet), shown first as a preview — what matched,
	 * what did not — and only applied when asked.
	 */
	const { store, paths } = kinkListContext();

	const PRESETS: Partial<Record<ListSourceId, string>> = {
		'adhesivecheese-classic': 'Classic',
		'adhesivecheese-detailed': 'Detailed',
		'adhesivecheese-plsno': "Please Don't"
	};

	let link = $state('');
	let reading = $state(false);
	let problem = $state('');
	let preview = $state<ImportResult | null>(null);
	let presets: {
		detected: ReturnType<typeof detectKinklistLink>;
		chosen: ListSourceId;
		options: ListSourceId[];
	} | null = $state(null);
	let mode: 'gaps' | 'replace' = $state('gaps');
	let done = $state('');

	const NOT_READABLE =
		"That isn't a link or file this can read. It takes Bound Up's own, links from KinkList, adhesiveCheese's kinklist, KinkSheet and Not Lewd Just Kinky, and spreadsheets (CSV).";

	function reset() {
		problem = '';
		preview = null;
		presets = null;
		done = '';
	}

	async function readLink() {
		reset();
		reading = true;
		try {
			const text = link.trim();
			const ours = text.includes('#k1.')
				? await decodeShareLink(text.slice(text.indexOf('#')))
				: null;
			if (ours) {
				preview = importList(ours.list, ours.name ? `${ours.name}’s shared list` : 'a shared list');
				return;
			}
			const detected = detectKinklistLink(text);
			const read = detected ? await importKinklistLink(detected) : null;
			if (!(detected && read)) {
				problem = NOT_READABLE;
				return;
			}
			preview = read.result;
			if (read.alternatives.length > 1 || detected.sources.length > 1) {
				presets = { detected, chosen: read.source, options: detected.sources };
			}
		} finally {
			reading = false;
		}
	}

	async function choosePreset(id: ListSourceId) {
		if (!presets?.detected) {
			return;
		}
		const read = await importKinklistLink(presets.detected, id);
		if (read) {
			preview = read.result;
			presets = { ...presets, chosen: read.source };
		}
	}

	let fileInput: HTMLInputElement | undefined = $state();
	let fileName: string | null = $state(null);

	async function readFile(event: Event) {
		reset();
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		fileName = file?.name ?? null;
		if (!file) {
			return;
		}
		const text = await file.text();
		const ours = readExportJson(text);
		const result = ours ? importList(ours, file.name) : importCsv(text);
		if (result) {
			preview = { ...result, source: result.source === 'a spreadsheet' ? file.name : result.source };
		} else {
			problem = NOT_READABLE;
		}
	}

	function apply() {
		if (!preview) {
			return;
		}
		const result = preview;
		const before = answeredCount(store.list);
		store.transform((list) => applyImport(list, result, { mode }));
		const added = answeredCount(store.list) - before;
		done =
			mode === 'replace'
				? 'Imported.'
				: `Imported: ${added} new ${added === 1 ? 'answer' : 'answers'}.`;
		preview = null;
		presets = null;
	}

	function download(name: string, type: string, text: string) {
		const url = URL.createObjectURL(new Blob([text], { type }));
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = name;
		anchor.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	const today = () => new Date().toISOString().slice(0, 10);

	type WaInput = HTMLElement & { value: string | null };
	type WaSelect = HTMLElement & { value: string | string[] | null };

	/** Wired by hand: these change inside their shadow roots (AGENTS.md). */
	function linkField(node: WaInput) {
		const onInput = () => {
			link = node.value ?? '';
		};
		node.addEventListener('input', onInput);
		return () => node.removeEventListener('input', onInput);
	}

	function presetField(node: WaSelect) {
		const onChange = () => void choosePreset(String(node.value) as ListSourceId);
		node.addEventListener('change', onChange);
		return () => node.removeEventListener('change', onChange);
	}

	const matched = $derived(preview ? Object.entries(preview.answers) : []);

	function levelOf(answer: ImportedAnswer): string {
		const parts = [answer.level, answer.sides?.a?.level, answer.sides?.b?.level].filter(
			(level): level is Level => level !== undefined
		);
		return [...new Set(parts)].map((level) => LEVEL_LABELS[level]).join(' / ') || 'Note only';
	}
</script>

<KinkListCrumbs href={paths.home} text="Kink list" label="Back to kink list">
	<SaveStatus />
</KinkListCrumbs>

<h1>Import and export</h1>

<section aria-labelledby="export-title">
	<h2 id="export-title">Export</h2>
	<p class="quiet">
		A file of your list, to keep or to bring back later. The spreadsheet opens in anything; the
		JSON file holds everything exactly.
	</p>
	<div class="row">
		<wa-button
			appearance="outlined"
			onclick={() => download(`kink-list-${today()}.csv`, 'text/csv', exportCsv(store.list))}
		>
			Spreadsheet (CSV)
		</wa-button>
		<wa-button
			appearance="outlined"
			onclick={() => download(`kink-list-${today()}.json`, 'application/json', exportJson(store.list))}
		>
			Everything (JSON)
		</wa-button>
	</div>
</section>

<section aria-labelledby="import-title">
	<h2 id="import-title">Import</h2>
	<p class="quiet">
		Paste a link to a kink list — Bound Up's own, or one from KinkList, adhesiveCheese's kinklist,
		KinkSheet or Not Lewd Just Kinky — or choose a file: a Bound Up export, or a spreadsheet saved
		as CSV, such as kinkbdsmtest.com's export. You'll see what it holds before anything changes.
	</p>
	<div class="link-row">
		<wa-input label="A link to a kink list" {@attach linkField}></wa-input>
		<wa-button
			variant="brand"
			appearance={link.trim() ? 'accent' : 'outlined'}
			disabled={reading}
			onclick={() => void readLink()}
		>
			Read link
		</wa-button>
	</div>
	<!-- The native file input stays, for its picker and for the file it
	     holds, but out of sight: its own "Choose File" button and "No file
	     chosen" are the browser's, unlike every other control here, and
	     cannot be styled. The button opens it, and says what was picked. -->
	<div class="file">
		<span class="file-title" id="file-title">Or choose a file</span>
		<div class="file-row">
			<wa-button appearance="outlined" onclick={() => fileInput?.click()}>
				<wa-icon slot="start" name="file-arrow-up" variant="solid"></wa-icon>
				Choose a file
			</wa-button>
			<span class="file-name">{fileName ?? 'A Bound Up export (.json) or a spreadsheet (.csv)'}</span>
		</div>
		<input
			bind:this={fileInput}
			class="wa-visually-hidden"
			type="file"
			accept=".json, .csv"
			tabindex="-1"
			aria-labelledby="file-title"
			onchange={(event) => void readFile(event)}
		/>
	</div>
	<p class="quiet small">
		Lists that keep your answers on their own servers, such as kinkli.st, and links that expire,
		such as KNKI's, can't be imported.
	</p>

	{#if problem}
		<p class="error" role="alert">{problem}</p>
	{/if}
	{#if done}
		<p class="done" role="status">{done} <a href={paths.home}>See your list</a></p>
	{/if}

	{#if preview}
		<div class="preview">
			<h3>From {preview.source}</h3>
			{#if presets && presets.options.length > 1}
				<wa-select label="Which list was it made on?" value={presets.chosen} {@attach presetField}>
					{#each presets.options as option (option)}
						<wa-option value={option}>{PRESETS[option] ?? option}</wa-option>
					{/each}
				</wa-select>
			{/if}
			<p>
				{matched.length === 1 ? '1 answer' : `${matched.length} answers`} for kinks on this list{#if preview.unmatched.length > 0},
					and {preview.unmatched.length === 1 ? '1 that isn’t' : `${preview.unmatched.length} that aren’t`}{/if}.
			</p>
			{#if matched.length > 0}
				<wa-details summary="What matched">
					<ul>
						{#each matched as [id, answer] (id)}
							<li>{kinkById(id)?.name}: {levelOf(answer)}</li>
						{/each}
					</ul>
				</wa-details>
			{/if}
			{#if preview.unmatched.length > 0}
				<wa-details summary="What didn't match, which is left out">
					<ul>
						{#each preview.unmatched as item, index (`${item.name}-${index}`)}
							<li>{item.name}: {levelOf(item.answer)}</li>
						{/each}
					</ul>
				</wa-details>
			{/if}

			<fieldset class="mode">
				<legend>Kinks you've already answered</legend>
				<label><input type="radio" name="import-mode" value="gaps" bind:group={mode} /> Keep my answers</label>
				<label><input type="radio" name="import-mode" value="replace" bind:group={mode} /> Use the imported ones</label>
			</fieldset>

			<div class="row">
				<wa-button variant="brand" appearance="accent" onclick={apply}>Import</wa-button>
				<wa-button appearance="plain" onclick={reset}>Cancel</wa-button>
			</div>
		</div>
	{/if}
</section>

<style>
	h1 {
		text-align: center;
	}

	section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-block-end: 2rem;

		/* The size every kink list page gives a section heading (the list's
		   own, history's): Web Awesome's default was nearly the title's. */
		h2 {
			margin: 0;
			font-size: 1.1rem;
		}
	}

	.quiet {
		margin: 0;
		color: var(--wa-color-text-quiet);

		&.small {
			font-size: 0.85rem;
		}
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.link-row {
		display: flex;
		align-items: flex-end;
		gap: 0.5rem;

		wa-input {
			flex: 1 1 auto;
		}
	}

	.file {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.file-title {
		font-weight: var(--wa-form-control-label-font-weight);
		color: var(--wa-form-control-label-color);
	}

	.file-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.75rem;
	}

	.file-name {
		min-inline-size: 0;
		overflow-wrap: anywhere;
		font-size: 0.875rem;
		color: var(--wa-color-text-quiet);
	}

	.preview {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem;
		border: var(--wa-border-width-s) solid var(--wa-color-surface-border);
		border-radius: var(--wa-border-radius-l);
		background: var(--wa-color-surface-default);

		h3,
		p {
			margin: 0;
		}

		ul {
			margin: 0;
		}
	}

	.mode {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin: 0;
		padding: 0;
		border: 0;

		legend {
			padding: 0;
			margin-block-end: 0.25rem;
			font-weight: var(--wa-font-weight-semibold);
		}
	}

	.error {
		margin: 0;
		color: var(--wa-color-danger-on-quiet);
	}

	.done {
		margin: 0;
		color: var(--wa-color-success-on-quiet);
	}
</style>
