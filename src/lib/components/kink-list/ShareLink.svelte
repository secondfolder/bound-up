<script lang="ts">
	import { resolve } from '$app/paths';
	import { answeredCount } from '$lib/kink-list/answers';
	import { kinkListContext } from '$lib/kink-list/context';
	import { encodeShareLink } from '$lib/kink-list/share-link';

	/**
	 * Makes a link to the list as it is now. The answers are in the link
	 * itself, after the `#`, so they reach whoever opens it without ever
	 * reaching the server; the link does not change as the list does, so a
	 * newer list needs a newer link.
	 */
	const { store } = kinkListContext();

	let withNotes = $state(true);
	let name = $state('');
	let link = $state('');
	let copied = $state(false);
	let failed = $state(false);

	const answered = $derived(answeredCount(store.list));

	async function make() {
		failed = false;
		copied = false;
		try {
			const fragment = await encodeShareLink(store.list, { withNotes, name });
			link = `${location.origin}${resolve('/(public)/kink-list/shared')}#${fragment}`;
		} catch {
			failed = true;
		}
	}

	async function copy() {
		try {
			await navigator.clipboard.writeText(link);
			copied = true;
		} catch {
			// The field is selectable; copying by hand still works.
			copied = false;
		}
	}

	type WaCheckbox = HTMLElement & { checked: boolean };
	type WaInput = HTMLElement & { value: string | null };

	/** Wired by hand: these change inside their shadow roots (AGENTS.md). */
	function notesField(node: WaCheckbox) {
		node.checked = withNotes;
		const onChange = () => {
			withNotes = node.checked;
			link = '';
		};
		node.addEventListener('change', onChange);
		return () => node.removeEventListener('change', onChange);
	}

	function nameField(node: WaInput) {
		const onInput = () => {
			name = node.value ?? '';
			link = '';
		};
		node.addEventListener('input', onInput);
		return () => node.removeEventListener('input', onInput);
	}

	function selectAll(node: WaInput) {
		const onFocus = () =>
			(node.shadowRoot?.querySelector('input') as HTMLInputElement | null)?.select();
		node.addEventListener('focus', onFocus);
		return () => node.removeEventListener('focus', onFocus);
	}
</script>

<div class="share">
	{#if answered === 0}
		<p class="quiet">Answer a few kinks first, then make a link to share them.</p>
	{:else}
		<wa-input label="Your name on it (optional)" maxlength={60} {@attach nameField}></wa-input>
		<wa-checkbox {@attach notesField}>Include my notes</wa-checkbox>
		<div>
			<wa-button variant="brand" appearance={link ? 'outlined' : 'accent'} onclick={make}>
				Make a link
			</wa-button>
		</div>
		{#if failed}
			<p class="error">That link couldn't be made in this browser.</p>
		{/if}
		{#if link}
			<wa-input label="Your link" readonly value={link} {@attach selectAll}></wa-input>
			<div class="row">
				<wa-button appearance="outlined" onclick={copy}>{copied ? 'Copied' : 'Copy'}</wa-button>
			</div>
			<p class="quiet">
				Anyone with this link can see the answers in it. It won't change as your list does.
			</p>
		{/if}
	{/if}
</div>

<style>
	.share {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.row {
		display: flex;
		gap: 0.5rem;
	}

	.quiet {
		margin: 0;
		font-size: 0.875rem;
		color: var(--wa-color-text-quiet);
	}

	.error {
		margin: 0;
		color: var(--wa-color-danger-on-quiet);
	}
</style>
