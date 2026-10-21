/**
 * One model call being waited on, as a page shows it (`ModelProgress.svelte`):
 * how far along it is, and with `live` debug mode's live chat — the request
 * sent and the answer as it comes, in the bubbles a chat log is drawn with
 * (`exchange-log.ts`). Made fresh for each call; `watch` is what the call is
 * given (`SuggestionWatch`). See docs/daydreams.md, "Progress while it writes".
 */

import { assertNever } from '../assert-never';
import type { LiveEvent, SuggestionWatch } from './client';
import { type LogEntry, parseRequest, sentEntry, settingsEntry } from './exchange-log';
import { type LiveDelta, type ModelProgress, WAITING } from './progress';

export class ModelWatch {
	progress: ModelProgress = $state({ ...WAITING });
	/** The live chat so far; empty without `live`. */
	entries: LogEntry[] = $state([]);
	/** The model asked and which API, once the request has been seen. */
	heading: string | null = $state(null);
	/** Whether the live chat was asked for: debug mode is on. */
	readonly live: boolean;

	constructor(live: boolean) {
		this.live = live;
	}

	/** All the reasoning so far, for a page that shows it on its own rather than as a chat. */
	get reasoning(): string {
		return this.entries
			.filter((entry) => entry.who === 'model' && entry.label === 'Reasoning')
			.map((entry) => entry.text)
			.join('\n\n');
	}

	/** What the call is given to report to. */
	get watch(): SuggestionWatch {
		return {
			onProgress: (progress) => {
				this.progress = progress;
			},
			...(this.live ? { onLive: (event: LiveEvent) => this.#add(event) } : {})
		};
	}

	/**
	 * A piece read in the browser, for a call whose progress the server does
	 * not send: a passage, whose stream is the provider's own (`stream.ts`).
	 */
	feed(delta: Extract<LiveDelta, { kind: 'text' | 'reasoning' }>) {
		const { progress } = this;
		this.progress =
			delta.kind === 'text'
				? { ...progress, stage: 'writing', chars: progress.chars + delta.text.length }
				: {
						...progress,
						stage: progress.stage === 'writing' ? 'writing' : 'thinking',
						reasoningChars: progress.reasoningChars + delta.text.length
					};
		if (this.live) {
			this.#add(delta);
		}
	}

	#add(event: LiveEvent) {
		switch (event.kind) {
			case 'request': {
				const request = parseRequest(event.body);
				if (request) {
					this.heading = `${request.model}, ${request.api}`;
					this.entries.push(...request.messages.map(sentEntry), settingsEntry(request));
				}
				return;
			}
			case 'reasoning':
				this.#append('Reasoning', event.text);
				return;
			case 'text':
				this.#append('Reply', event.text);
				return;
			case 'fetch':
				this.entries.push({
					who: 'model',
					label: `Fetched ${event.url} (${event.status})`,
					text: ''
				});
				return;
			default:
				assertNever(event, 'live event');
		}
	}

	/** A piece added to the bubble it continues, or the start of a new one. */
	#append(label: string, text: string) {
		const last = this.entries.at(-1);
		if (last?.who === 'model' && last.label === label) {
			last.text += text;
		} else {
			this.entries.push({ who: 'model', label, text });
		}
	}
}
