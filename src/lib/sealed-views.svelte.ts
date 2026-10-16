/**
 * Tasks, rewards, completions and claims as a template shows them.
 *
 * BROWSER ONLY in effect: it opens records through `sealedReader`. On the
 * server, where no vault is ever open, every sealed record reads as
 * `undefined` — the placeholder — which is what SSR should render anyway.
 *
 * Each opener answers in the three states `sealed-cache.svelte.ts` describes:
 * `undefined` while working (a placeholder), `null` when the record will not
 * open here ("cannot show"), and the content otherwise. A row written before
 * sealing has no `sealed` yet and answers with its plaintext straight away;
 * the background sealing (`content-sealing.ts`) moves it over.
 *
 * Which vault to open with is the one the record names. A page does not get
 * to choose, so a partnership task shown on /home opens exactly as it does on
 * the partner's own page.
 */

import { vaultById } from './crypto/vaults.svelte';
import { sealedReader } from './sealed-cache.svelte';
import { type RewardContent, rewardKind, type TaskContent, taskKind } from './sealed-kinds/tasks';
import type { RewardHistoryView, SealedRefView, TaskCompletionView, WidgetItemView } from './types';

export type Opened<T> = T | null | undefined;

function open<T>(kind: typeof taskKind | typeof rewardKind, ref: SealedRefView): Opened<T> {
	return sealedReader.read(kind, ref, vaultById(ref.vaultId)) as Opened<T>;
}

/** A task's content: title, description, completion messages. */
export function openedTask(task: {
	title: string;
	description: string | null;
	completionMessages: string[];
	sealed: SealedRefView | null;
}): Opened<TaskContent> {
	if (!task.sealed) {
		return {
			title: task.title,
			description: task.description,
			completionMessages: task.completionMessages
		};
	}
	return open<TaskContent>(taskKind, task.sealed);
}

export type OpenedCompletion = {
	taskTitle: string;
	taskDescription: string | null;
	completionMessage: string | null;
};

/**
 * A completion as history shows it: the task as it was when completed, and
 * the message that was picked for it. The server picked an index into the
 * task's messages without being able to read them; this is where it is read.
 */
export function openedCompletion(completion: TaskCompletionView): Opened<OpenedCompletion> {
	if (!completion.sealed) {
		return {
			taskTitle: completion.taskTitle,
			taskDescription: completion.taskDescription,
			completionMessage: completion.completionMessage
		};
	}
	const task = open<TaskContent>(taskKind, completion.sealed);
	if (!task) {
		return task;
	}
	const index = completion.completionMessageIndex;
	return {
		taskTitle: task.title,
		taskDescription: task.description,
		completionMessage: index === null ? null : (task.completionMessages[index] ?? null)
	};
}

/** A reward's content: title and description. */
export function openedReward(reward: {
	title: string;
	description: string | null;
	sealed: SealedRefView | null;
}): Opened<RewardContent> {
	if (!reward.sealed) {
		return { title: reward.title, description: reward.description };
	}
	return open<RewardContent>(rewardKind, reward.sealed);
}

/** A claim as history shows it: the reward as it was when claimed. */
export function openedClaim(claim: RewardHistoryView): Opened<RewardContent> {
	if (!claim.sealed) {
		return { title: claim.rewardTitle, description: claim.rewardDescription };
	}
	return open<RewardContent>(rewardKind, claim.sealed);
}

/** A widget row's title, from whichever kind the row is. */
export function openedWidgetTitle(item: WidgetItemView): Opened<string> {
	if (!item.sealed) {
		return item.title;
	}
	const content =
		item.kind === 'task'
			? open<TaskContent>(taskKind, item.sealed)
			: open<RewardContent>(rewardKind, item.sealed);
	return openedPart(content, (value) => value.title);
}

/** What stands in for content that is not open: still working, or will not open here. */
export const PENDING_TEXT = '…';
export const UNREADABLE_TEXT = "Can't be shown on this device";

/** Text in its three states, for a place that must say something. */
export function shownText(opened: Opened<string>): string {
	if (opened === undefined) {
		return PENDING_TEXT;
	}
	return opened ?? UNREADABLE_TEXT;
}

/** One part of something opened, keeping "still working" and "will not open" apart. */
export function openedPart<T, Part>(opened: Opened<T>, part: (value: T) => Part): Opened<Part> {
	if (opened === undefined) {
		return undefined;
	}
	return opened === null ? null : part(opened);
}

/** A title in its three states, for a heading. */
export function shownTitle(opened: Opened<{ title: string }>): string {
	return shownText(openedPart(opened, (value) => value.title));
}
