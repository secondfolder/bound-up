<script lang="ts">
	import {
		LINT_RULE_LABELS,
		PARAGRAPH_BREAK,
		type PromptView,
		roughTokens
	} from '$lib/prompt-review';
	import { startOpen } from '../details';
	import PromptText from './PromptText.svelte';

	/**
	 * One rendered prompt for the prompt review page (docs/prompt-review.md):
	 * its settings, anything lint found in it, and each message open, cut into
	 * the paragraphs the catalogue counts, each with a mark for whether this
	 * device has reviewed it.
	 */
	let {
		view,
		reviewed,
		ontoggle
	}: {
		view: Extract<PromptView, { ok: true }>;
		reviewed: ReadonlySet<string>;
		ontoggle: (id: string) => void;
	} = $props();

	/** Each message's paragraphs with their ids, which the view lists in order across all messages. */
	const messages = $derived.by(() => {
		let next = 0;
		return view.prompt.messages.map((message) => ({
			...message,
			paragraphs: message.content
				.split(PARAGRAPH_BREAK)
				.filter((text) => text.trim() !== '')
				.map((text) => {
					const id = view.paragraphIds[next] ?? '';
					next += 1;
					return { id, text };
				})
		}));
	});

	const total = $derived(
		view.prompt.messages.reduce((sum, message) => sum + message.content.length, 0)
	);
</script>

<p class="settings">
	{#each Object.entries(view.prompt.params) as [key, value] (key)}
		<span><strong>{key}</strong> {JSON.stringify(value)}</span>
	{/each}
	<span><strong>size</strong> {total.toLocaleString('en')} characters, ~{roughTokens(
			view.prompt.messages.map((message) => message.content).join('')
		).toLocaleString('en')} tokens</span>
</p>

{#if view.lint.length > 0}
	<wa-callout variant="warning" size="s">
		<wa-icon slot="icon" name="triangle-exclamation" variant="solid"></wa-icon>
		<ul class="lint">
			{#each view.lint as finding, index (index)}
				<li><strong>{LINT_RULE_LABELS[finding.rule]}</strong>: <code>{finding.excerpt}</code></li>
			{/each}
		</ul>
	</wa-callout>
{/if}

<ol class="messages">
	{#each messages as message, index (index)}
		<li class={message.role}>
			<wa-details
				summary={`${index + 1}. ${message.role} · ${message.content.length.toLocaleString('en')} characters`}
				appearance="plain"
				{@attach startOpen(true)}
			>
				{#each message.paragraphs as paragraph, position (position)}
					<div class="paragraph" class:reviewed={reviewed.has(paragraph.id)}>
						<!-- A toggle, so a native button: wa-button does not forward
						     aria-pressed to the control inside it (AGENTS.md). -->
						<button
							type="button"
							class="mark"
							aria-pressed={reviewed.has(paragraph.id)}
							title={reviewed.has(paragraph.id) ? 'Reviewed: mark as not reviewed' : 'Mark as reviewed'}
							onclick={() => ontoggle(paragraph.id)}
						>
							<wa-icon
								name={reviewed.has(paragraph.id) ? 'circle-check' : 'circle'}
								variant={reviewed.has(paragraph.id) ? 'solid' : 'regular'}
								label="Reviewed"
							></wa-icon>
						</button>
						<pre><PromptText text={paragraph.text} /></pre>
					</div>
				{/each}
			</wa-details>
		</li>
	{/each}
</ol>

<style>
	pre {
		flex: 1 1 auto;
		min-width: 0;
		margin: 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font-family: var(--wa-font-family-code, monospace);
		font-size: 0.8125rem;
	}

	.settings {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
		margin: 0 0 0.75rem;
		font-size: var(--wa-font-size-s);
		color: var(--wa-color-text-quiet);

		strong {
			color: var(--wa-color-text-normal);
		}
	}

	.lint {
		margin: 0;
		padding-inline-start: 1rem;
		font-size: var(--wa-font-size-s);

		code {
			overflow-wrap: anywhere;
		}
	}

	wa-callout {
		margin-block-end: 0.75rem;
	}

	.messages {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;

		> li {
			border: 1px solid var(--wa-color-surface-border);
			border-radius: var(--wa-border-radius-m);

			&.user {
				background: var(--wa-color-surface-raised);
			}
		}
	}

	.paragraph {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		padding-block: 0.25rem;
		border-inline-start: 3px solid transparent;
		padding-inline-start: 0.25rem;

		&.reviewed {
			border-inline-start-color: var(--wa-color-success-border-loud);

			pre {
				color: var(--wa-color-text-quiet);
			}
		}
	}

	.mark {
		flex: none;
		padding: 0.125rem;
		border: 0;
		background: none;
		color: var(--wa-color-text-quiet);
		cursor: pointer;

		&[aria-pressed='true'] {
			color: var(--wa-color-success-on-quiet);
		}
	}
</style>
