/**
 * The one way a scene's page asks the model for anything: a button calls
 * `ask`, which first makes sure the person has agreed to what it sends
 * (once, ever), then asks. Shared by every button that can, so there is one
 * agreement, one "Thinking…" at a time and one place a failure is said. See
 * docs/scenes.md, "Help from the model".
 *
 * BROWSER ONLY at run time.
 */

import { acceptHelp, askForHelp } from './help-client';
import type { SceneHelpAnswer, SceneHelpRequest, SceneHelpTask } from './model-help';

export class HelpGate {
	/** Whether the server has a model at all. Without one, no button offers help. */
	readonly available: boolean;
	accepted = $state(false);
	/** The agreement is on screen, waiting for an answer. */
	consenting = $state(false);
	/** Which task is being answered, for its button to say so. */
	busy = $state<SceneHelpTask | null>(null);
	error = $state<string | null>(null);

	#decide: ((agreed: boolean) => void) | null = null;

	constructor(help: { available: boolean; accepted: boolean }) {
		this.available = help.available;
		this.accepted = help.accepted;
	}

	/** The answer, or null when the person said not now or it failed (`error` says why). */
	async ask(request: SceneHelpRequest): Promise<SceneHelpAnswer | null> {
		if (!this.available || this.busy) {
			return null;
		}
		this.error = null;
		if (!this.accepted) {
			this.consenting = true;
			const agreed = await new Promise<boolean>((decide) => {
				this.#decide = decide;
			});
			this.consenting = false;
			if (!agreed) {
				return null;
			}
			if (!(await acceptHelp())) {
				this.error = 'That could not be saved. Try again.';
				return null;
			}
			this.accepted = true;
		}
		this.busy = request.task;
		try {
			const result = await askForHelp(request);
			if (!result.ok) {
				this.error = result.error;
				return null;
			}
			return result.answer;
		} finally {
			this.busy = null;
		}
	}

	/** The person's answer to the agreement. */
	decide(agreed: boolean): void {
		this.#decide?.(agreed);
		this.#decide = null;
	}
}
