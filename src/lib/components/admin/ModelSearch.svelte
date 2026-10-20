<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import type {
		ModelSearchAnswer,
		OpenRouterModelResult,
		RunwareModelResult
	} from '$lib/model-search';
	import { reportRequestFailure, tryFetch } from '$lib/request-failure.svelte';

	/**
	 * Searches a provider's models for `ModelChoice`, and hands back the one
	 * picked. OpenRouter's list is public; Runware's needs the saved key, and
	 * says so inline when there is none (a 409 from the endpoint).
	 *
	 * Searching is not part of the form: the input has no name, and only what
	 * `onpick` does with a result is saved.
	 */
	type Props =
		| {
				provider: 'openrouter';
				label: string;
				onpick: (result: OpenRouterModelResult) => void;
		  }
		| {
				provider: 'runware';
				label: string;
				onpick: (result: RunwareModelResult) => void;
		  };

	let props: Props = $props();

	let query = $state('');
	let results = $state<(OpenRouterModelResult | RunwareModelResult)[] | null>(null);
	let notice = $state<string | null>(null);
	let searching = $state(false);
	let controller: AbortController | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;

	/** A pause after typing before asking, so each keystroke is not a request. */
	const DEBOUNCE_MS = 300;

	async function search(text: string) {
		controller?.abort();
		const current = new AbortController();
		controller = current;
		searching = true;
		notice = null;
		try {
			const response = await tryFetch(
				`/api/admin/models/${props.provider}?q=${encodeURIComponent(text)}`,
				{ signal: current.signal }
			);
			if (!response) {
				reportRequestFailure(null);
				return;
			}
			if (response.status === 409) {
				const answer = (await response.json()) as ModelSearchAnswer<never>;
				notice = 'message' in answer ? answer.message : null;
				results = null;
				return;
			}
			if (!response.ok) {
				reportRequestFailure(response);
				return;
			}
			({ results } = (await response.json()) as { results: typeof results });
		} catch (error) {
			if (!(error instanceof DOMException && error.name === 'AbortError')) {
				throw error;
			}
		} finally {
			if (controller === current) {
				searching = false;
			}
		}
	}

	/**
	 * Listened for directly rather than with `oninput=`: Svelte's delegated
	 * events do not reliably cross `wa-input`'s shadow root (AGENTS.md), and
	 * unlike a form field this one has nothing but Svelte state to go on.
	 */
	const listen: Attachment<HTMLElement> = (element) => {
		const onInput = () => {
			query = String((element as HTMLElement & { value: unknown }).value ?? '');
			clearTimeout(timer);
			if (query.trim() === '') {
				// Emptied: nothing to show, and an answer still on its way for
				// what was there before must not bring the list back.
				controller?.abort();
				results = null;
				notice = null;
				searching = false;
				return;
			}
			timer = setTimeout(() => search(query), DEBOUNCE_MS);
		};
		element.addEventListener('input', onInput);
		// The clear button empties the field with an event of its own.
		element.addEventListener('wa-clear', onInput);
		return () => {
			element.removeEventListener('input', onInput);
			element.removeEventListener('wa-clear', onInput);
			clearTimeout(timer);
			controller?.abort();
		};
	};

	const money = new Intl.NumberFormat(undefined, {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 2
	});

	function summary(result: OpenRouterModelResult | RunwareModelResult): string {
		if ('openrouterModelId' in result) {
			const price =
				result.promptPerMillion === null || result.completionPerMillion === null
					? null
					: `${money.format(result.promptPerMillion)} in, ${money.format(result.completionPerMillion)} out per million tokens`;
			return [result.openrouterModelId, price].filter(Boolean).join(' · ');
		}
		return [result.runwareModelAir, result.architecture || null].filter(Boolean).join(' · ');
	}

	function pick(result: OpenRouterModelResult | RunwareModelResult) {
		if (props.provider === 'openrouter' && 'openrouterModelId' in result) {
			props.onpick(result);
		} else if (props.provider === 'runware' && 'runwareModelAir' in result) {
			props.onpick(result);
		}
		results = null;
	}
</script>

<div class="search">
	<wa-input type="search" label={props.label} autocomplete="off" {@attach listen}>
		{#if searching}<wa-spinner slot="end"></wa-spinner>{/if}
	</wa-input>
	{#if notice}
		<p class="notice">{notice}</p>
	{:else if results && results.length === 0}
		<p class="notice">Nothing matches “{query}”.</p>
	{:else if results}
		<!-- Native buttons rather than wa-buttons: each is a choice in a list,
		     with two lines in it, and none holds any state of its own. -->
		<ul aria-label="Search results">
			{#each results as result ('openrouterModelId' in result ? result.openrouterModelId : result.runwareModelAir)}
				<li>
					<button type="button" onclick={() => pick(result)}>
						<span class="name"
							>{result.name}{#if 'version' in result && result.version}
								<small>{result.version}</small>{/if}</span
						>
						<small class="detail">{summary(result)}</small>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.search {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;

		.notice {
			margin: 0;
			color: var(--wa-color-text-quiet);
		}

		ul {
			margin: 0;
			padding: 0;
			max-height: 18rem;
			overflow-x: hidden;
			overflow-y: auto;
			border: 1px solid var(--wa-color-surface-border);
			border-radius: var(--wa-border-radius-m);

			li {
				list-style-type: none;

				& + li {
					border-top: 1px solid var(--wa-color-surface-border);
				}
			}
		}

		/* Web Awesome's native styles give every <button> a control's fixed
		   height, padding and nowrap, which pressed each result against the
		   rules between them and ran a long id off the side; each is undone. */
		button {
			display: flex;
			flex-direction: column;
			align-items: flex-start;
			gap: 0.2rem;
			box-sizing: border-box;
			width: 100%;
			height: auto;
			min-height: 0;
			margin: 0;
			padding: 0.75rem 0.875rem;
			border: 0;
			border-radius: 0;
			background: none;
			color: inherit;
			font: inherit;
			line-height: var(--wa-line-height-normal);
			white-space: normal;
			text-align: start;
			cursor: pointer;

			.name,
			.detail {
				max-width: 100%;
				overflow-wrap: anywhere;
			}

			&:hover,
			&:focus-visible {
				background: var(--wa-color-surface-raised);
			}

			.name small,
			.detail {
				color: var(--wa-color-text-quiet);
			}

			.name small {
				margin-inline-start: 0.4rem;
			}
		}
	}
</style>
