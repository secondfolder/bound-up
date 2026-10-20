<script lang="ts">
	import type { LinkFetch } from '$lib/daydream/suggestions';

	/**
	 * The links a suggestion read from a brief, for debug mode
	 * (docs/debug-mode.md): each one's URL, whether the fetch engine got it,
	 * and the start of what the model was given — enough to tell a page from
	 * a login wall or an error, which is most of why ideas built on a link
	 * come back thin. Nothing here is kept; it is the answer's own.
	 */
	let { fetches }: { fetches: readonly LinkFetch[] } = $props();

	const read = $derived(fetches.filter((fetched) => fetched.read).length);
</script>

<wa-details summary="Links read: {read} of {fetches.length}" class="fetches">
	<ul>
		{#each fetches as fetched, index (index)}
			<li>
				<!-- Shown, not linked: these are whatever the brief said, and
				     debug mode is for looking at them, not visiting them. -->
				<code class="url">{fetched.url}</code>
				<span class={fetched.read ? 'status' : 'status failed'}>
					{#if fetched.read}
						Read{fetched.httpStatus === null ? '' : ` · HTTP ${fetched.httpStatus}`} · {fetched.length.toLocaleString()}
						characters{fetched.title ? ` · “${fetched.title}”` : ''}
					{:else}
						Not read{fetched.httpStatus === null ? '' : ` · HTTP ${fetched.httpStatus}`}{fetched.error
							? `: ${fetched.error}`
							: ''}
					{/if}
				</span>
				{#if fetched.excerpt}
					<pre>{fetched.excerpt}{fetched.length > fetched.excerpt.length ? '\n… (cut)' : ''}</pre>
				{/if}
			</li>
		{/each}
	</ul>
</wa-details>

<style>
	ul {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.url {
		overflow-wrap: anywhere;
		font-size: 0.8125rem;
	}

	.status {
		color: var(--wa-color-text-quiet);
		font-size: var(--wa-font-size-s);
	}

	.failed {
		color: var(--wa-color-text-danger);
	}

	pre {
		margin: 0;
		max-block-size: 12rem;
		overflow: auto;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font-family: var(--wa-font-family-code, monospace);
		font-size: 0.8125rem;
	}
</style>
