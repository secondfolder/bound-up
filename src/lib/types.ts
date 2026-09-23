import type { KeyWrapParams, KeyWrapType } from './encryption';
import type { MessageBodyFormat, ThreadIcon } from './messaging';

/**
 * Shared types that BOTH server code and Svelte components need.
 *
 * Deliberately not under `$lib/server/` (components may not import from there),
 * and deliberately alias-free so the Drizzle schema can import it by relative
 * path — drizzle-kit and the seed script bundle the schema outside Vite, where
 * `$lib` does not resolve.
 */

export type EdgeTaskDisplayText = {
	/** Show this text once the running count reaches this value. */
	showFrom: number;
	text: string;
};

export type EdgeTaskInstructions = {
	type: 'count';
	version: 1;
	/** Total number of `action`s required to complete the edge task. */
	required: number;
	action: 'edge';
	displayText: EdgeTaskDisplayText[];
};

/** The subset of an `edge_tasks` row that EdgeTask.svelte consumes. */
export type EdgeTaskView = {
	id: string;
	order: number;
	instructions: EdgeTaskInstructions;
};

export type TaskRepeatUnit = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

export type TaskWeekday = 'mo' | 'tu' | 'we' | 'th' | 'fr' | 'sa' | 'su';

export type TaskScheduleEnd =
	| { kind: 'never' }
	| { kind: 'until'; untilLocal: string }
	| { kind: 'count'; count: number };

export type TaskMonthlyPattern =
	| { kind: 'day-of-month'; day: number }
	| { kind: 'nth-weekday'; ordinal: 1 | 2 | 3 | 4 | -1; weekday: TaskWeekday };

export type TaskSchedule =
	| { mode: 'one-off' }
	| {
			mode: 'rolling-window';
			limit: null | {
				completions: number;
				every: number;
				unit: TaskRepeatUnit;
			};
	  }
	| { mode: 'after-completion'; every: number; unit: TaskRepeatUnit }
	| {
			mode: 'scheduled';
			anchorLocal: string;
			frequency: 'day' | 'week' | 'month' | 'year';
			interval: number;
			weekdays?: TaskWeekday[];
			monthlyPattern?: TaskMonthlyPattern;
			end: TaskScheduleEnd;
	  };

export type TaskTimeZoneNoteView = {
	timeZone: string;
	referenceTimeZone: string;
	date: Date;
	showCurrentTime: boolean;
};

export type TaskCompletionView = {
	id: string;
	taskTitle: string;
	taskDescription: string | null;
	creditsAwarded: number;
	completionMessage: string | null;
	createdAt: Date;
};

export type PartnershipTaskCompletionView = TaskCompletionView & {
	mine: boolean;
	createdByMe: boolean;
};

export type SelfTaskView = {
	id: string;
	title: string;
	description: string | null;
	active: boolean;
	creditsAwarded: number;
	completionMessages: string[];
	schedule: TaskSchedule;
	timezoneOwnerUserId: string;
	lastCompletedAt: Date | null;
	completedCount: number;
	nextEligibleAt: Date | null;
	canComplete: boolean;
	createdAt: Date;
	updatedAt: Date;
	timeZoneNote: TaskTimeZoneNoteView | null;
};

export type PartnershipTaskView = {
	id: string;
	title: string;
	description: string | null;
	active: boolean;
	creditsAwarded: number;
	completionMessages: string[];
	schedule: TaskSchedule;
	timezoneOwnerUserId: string;
	lastCompletedAt: Date | null;
	completedCount: number;
	nextEligibleAt: Date | null;
	createdByMe: boolean;
	canManage: boolean;
	canComplete: boolean;
	createdAt: Date;
	updatedAt: Date;
	timeZoneNote: TaskTimeZoneNoteView | null;
};

export type SelfTasksSectionView = {
	tasks: SelfTaskView[];
	completions: TaskCompletionView[];
};

export type HomePartnerTasksSectionView = {
	partnershipId: string;
	name: string;
	image: string | null;
	tasks: PartnershipTaskView[];
};

/** The subset of a `guides` row that GuidesList.svelte / Guide.svelte consume. */
export type GuideView = {
	id: string;
	title: string;
};

/**
 * The subset of a partnership that AppNav.svelte renders as a tab.
 *
 * `id` is the *partnership* id, not the other person's user id: it is what
 * `/partner/[id]` is keyed on, so no user id ever appears in a URL. `name` is
 * already resolved to what this viewer calls them — see `viewPartnership` in
 * `src/lib/partnership.ts`, which is the only place the per-role name columns
 * are read.
 */
export type PartnerView = {
	id: string;
	name: string;
	/** Avatar URL, or null to fall back to initials. */
	image: string | null;
};

/**
 * One stored way to unlock the age identity, as the browser needs it.
 *
 * `blob` and `params` are opaque to everything server-side: the server stores
 * them and hands them back, and only `src/lib/crypto/` knows what they mean.
 * There is deliberately nothing here that would let a screen decide whether a
 * key is trustworthy — that judgement is made against a locally pinned copy.
 */
export type KeyWrapView = {
	id: string;
	type: KeyWrapType;
	params: KeyWrapParams;
	blob: string;
	label: string | null;
	lastUsedAt: Date | null;
	createdAt: Date;
};

/** What `EncryptionGate` fetches to unlock. Null recipient means "not set up". */
export type UnlockBundleView = {
	recipient: string | null;
	historyWarningAcknowledged: boolean;
	wraps: KeyWrapView[];
	/**
	 * How many passkeys the account has registered.
	 *
	 * Not the same question as "can this browser do WebAuthn". Offering to set
	 * up a passkey unlock to someone who has never registered one opens a
	 * chooser with nothing in it, and WebAuthn reports that as the same error as
	 * a cancelled prompt — so the offer has to be withheld rather than
	 * explained afterwards.
	 */
	passkeyCount: number;
	/**
	 * How many of those were tried against PRF and could not do it.
	 *
	 * Sent alongside the total rather than as a boolean, because the unlock
	 * screen has to tell three cases apart: a passkey that works, passkeys that
	 * are all known not to, and a passkey nothing has ever tried — which is any
	 * passkey registered before this check existed, and might work fine. Only
	 * the middle case gets the "your password manager cannot do this" message.
	 */
	passkeysKnownUnusable: number;
	/**
	 * The AAGUID of one passkey that was tried and failed, when it has one.
	 *
	 * So the unlock screen can say which password manager is at fault rather
	 * than leaving the user to guess. Often null: Apple reports the anonymous
	 * AAGUID under the default attestation, so the copy has to work without it.
	 */
	unusableProviderAaguid: string | null;
};

/**
 * The two public keys behind one partnership, for the safety number.
 *
 * Either may be null — a partner who has not set up messaging yet has no key,
 * and neither does a viewer who has not. Both are needed: pinning only theirs
 * would miss a server that swapped *yours*, which would make your partner
 * encrypt to a key you do not hold.
 */
export type PartnerRecipientsView = {
	mine: string | null;
	theirs: string | null;
};

/**
 * One thread as a sticker on the board.
 *
 * `unread` is already resolved for this viewer. No component compares a sender
 * id against a user id — that flip is the same trap as the partnership name
 * columns (AGENTS.md invariant 12), so it happens in one place on the server.
 */
export type ThreadStickerView = {
	id: string;
	icon: ThreadIcon;
	tags?: TagView[];
	unread: boolean;
	lastMessageAt: Date;
	/** Null for a thread this viewer has never read up to its current latest message. */
	lastFullyReadAt: Date | null;
	messageCount: number;
	/** The thread's first message, used for the board preview once unlocked. */
	previewCiphertext: string;
	/** Cached derived metadata for the first message, encrypted like the body. */
	previewMetadataCiphertext: string | null;
};

export type TagView = {
	id: string;
	name: string;
	color: string;
};

/** An attachment, as much of it as the server knows: an id and a size. */
export type AttachmentView = {
	id: string;
	byteSize: number;
};

export type ReactionView = {
	/** Whether this is the viewer's own reaction, so it can be removed. */
	mine: boolean;
	ciphertext: string;
};

export type MessageView = {
	id: string;
	/** Which side of the conversation. Resolved server-side, like partnerName. */
	mine: boolean;
	/** base64 age ciphertext. Never rendered as text, even briefly. */
	ciphertext: string;
	/**
	 * LEGACY-RICHTEXT — `'plain'` for a body written before rich text existed.
	 * The client uses it to find its own un-migrated messages; see
	 * docs/temporary-code.md.
	 */
	bodyFormat: MessageBodyFormat;
	/** Cached derived metadata for the message body, encrypted like the body. */
	metadataCiphertext: string | null;
	createdAt: Date;
	attachments: AttachmentView[];
	reactions: ReactionView[];
};

export type ThreadView = {
	id: string;
	icon: ThreadIcon;
	tags?: TagView[];
	messages: MessageView[];
};

/** One row on /home: a partner with something waiting. */
export type UnreadPartnerView = {
	partnershipId: string;
	name: string;
	image: string | null;
	unreadThreads: number;
	newestAt: Date;
};

export type RewardHistoryView = {
	id: string;
	rewardTitle: string;
	rewardDescription: string | null;
	rewardCost: number;
	createdAt: Date;
};

export type SelfRewardView = {
	id: string;
	title: string;
	description: string | null;
	cost: number;
	active: boolean;
	canClaim: boolean;
	createdAt: Date;
	updatedAt: Date;
};

export type PartnershipRewardView = {
	id: string;
	title: string;
	description: string | null;
	cost: number;
	active: boolean;
	createdByMe: boolean;
	canClaim: boolean;
	createdAt: Date;
	updatedAt: Date;
};

export type PartnershipRewardClaimView = RewardHistoryView & {
	mine: boolean;
	createdByMe: boolean;
};

export type SelfRewardsSectionView = {
	credits: number;
	rewards: SelfRewardView[];
	claims: RewardHistoryView[];
};

export type HomePartnerRewardsSectionView = {
	partnershipId: string;
	name: string;
	image: string | null;
	credits: number;
	rewards: PartnershipRewardView[];
};

/**
 * A partner asking to have the shared history re-encrypted to a new key.
 *
 * `requestedRecipient` is the snapshot the partner must compare out of band
 * before confirming — see the table comment in schema/app.ts for why using the
 * live value instead would hand a malicious server the whole history.
 */
export type RestoreRequestView = {
	id: string;
	requestedRecipient: string;
	createdAt: Date;
	/** True when the viewer is the one who lost their key. */
	mine: boolean;
};

/**
 * One line in a section widget's preview body: what it is, and one short note.
 *
 * Deliberately not a narrowed task/reward view. A widget row shows a title and
 * at most one number, and giving each domain its own row type would mean three
 * near-identical list components instead of `WidgetItems.svelte`.
 */
export type WidgetItemView = {
	id: string;
	title: string;
	/** A credit award, a cost — rendered as a pill, or omitted when null. */
	note: string | null;
	/**
	 * Whose section this row comes from on the full page, or null for your own.
	 *
	 * /home merges your things with every partner's into one list, so a row has
	 * to say which. Without it "Kneel at eight" and "Kneel at eight" from two
	 * different partners are the same line twice.
	 */
	context: string | null;
};

/**
 * One reward balance, and who it is with.
 *
 * A list rather than a number because credits do not pool: a partnership's
 * credits buy that partnership's rewards and nothing else, so adding them up
 * would state a spending power nobody has. `label` is null for your own.
 */
export type WidgetBalanceView = {
	id: string;
	label: string | null;
	credits: number;
};

/**
 * What the tasks card previews.
 *
 * `viewerActs` is false for the side of a partnership that manages tasks rather
 * than completing them; "ready to complete" means nothing to them, so the card
 * shows `activeCount` instead. It is always true on /home, where there is only
 * one side.
 */
export type TasksWidgetView = {
	viewerActs: boolean;
	/** Ready to complete right now. Capped — `readyCount` is the real total. */
	ready: WidgetItemView[];
	readyCount: number;
	/** Active, but waiting on a schedule. */
	waitingCount: number;
	activeCount: number;
};

/** What the rewards card previews. `viewerActs` as in `TasksWidgetView`. */
export type RewardsWidgetView = {
	viewerActs: boolean;
	/** One entry per scope: your own on /home, the partnership on a partner page. */
	balances: WidgetBalanceView[];
	/** Affordable right now. Capped — `claimableCount` is the real total. */
	claimable: WidgetItemView[];
	claimableCount: number;
	/**
	 * Every active reward in scope, for the managing side's count.
	 *
	 * There is deliberately no count of the *unaffordable* ones. The card does
	 * not mention a reward you cannot claim yet — see docs/section-widgets.md.
	 */
	activeCount: number;
};

/** What the guides card previews. `total` may exceed `guides.length`. */
export type GuidesWidgetView = {
	guides: GuideView[];
	total: number;
};

/**
 * What one partnership's messages card previews.
 *
 * Counts only: every body is encrypted to keys the server does not hold, so
 * there is no preview text it could return. See docs/encryption.md.
 */
export type PartnerMessagesWidgetView = {
	unreadThreads: number;
	totalThreads: number;
	newestAt: Date | null;
};
