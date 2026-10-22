import type { DaydreamTurnRole } from './daydream';
import type { KeyWrapParams, KeyWrapType } from './encryption';
import type { ThreadIcon } from './messaging';
import type { EntryAccess, NotebookKind, PartnerAccess } from './notebook';
import type { PartnerNamesSource } from './partnership';
import type { Intensity, Role, Vibe } from './playroom/iq-test/settings';
import type { VaultKind } from './vault';

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

/**
 * A sealed record a device can open: which record it is sealed as, under
 * which vault, and at what payload version. See docs/encryption.md, "Sealed
 * records". Null on a view means the row is still plaintext, written before
 * sealing, until a device seals it.
 */
export type SealedRefView = {
	recordId: string;
	vaultId: string;
	ciphertext: string;
	payloadVersion: number;
};

/**
 * A completed task, as history.
 *
 * `sealed` is the task as it was, copied when it was completed, and
 * `completionMessageIndex` which of its messages was picked. Null `sealed` is
 * a completion recorded before sealing, whose `taskTitle`, `taskDescription`
 * and `completionMessage` are still plaintext; for a sealed one they are empty
 * until a device opens it (`openedCompletion` in `sealed-views.svelte.ts`).
 */
export type TaskCompletionView = {
	id: string;
	taskTitle: string;
	taskDescription: string | null;
	creditsAwarded: number;
	completionMessage: string | null;
	createdAt: Date;
	sealed: SealedRefView | null;
	completionMessageIndex: number | null;
};

export type PartnershipTaskCompletionView = TaskCompletionView & {
	mine: boolean;
	createdByMe: boolean;
};

/**
 * `title`, `description` and `completionMessages` are plaintext only on a task
 * written before sealing; on a sealed one (`sealed`) they are empty until a
 * device opens it (`openedTask` in `sealed-views.svelte.ts`). `revision` is
 * what an edit is compare-and-swap against.
 */
export type SelfTaskView = {
	id: string;
	title: string;
	description: string | null;
	active: boolean;
	creditsAwarded: number;
	completionMessages: string[];
	sealed: SealedRefView | null;
	revision: number;
	schedule: TaskSchedule;
	timezoneOwnerUserId: string;
	lastCompletedAt: Date | null;
	completedCount: number;
	nextEligibleAt: Date | null;
	/**
	 * How many completions count against a rolling window's limit right now,
	 * for "1 left"; null for a task with no such limit.
	 */
	windowCompletions: number | null;
	canComplete: boolean;
	createdAt: Date;
	updatedAt: Date;
	timeZoneNote: TaskTimeZoneNoteView | null;
};

/** As `SelfTaskView`, sealed in the partnership's vault. */
export type PartnershipTaskView = {
	id: string;
	title: string;
	description: string | null;
	active: boolean;
	creditsAwarded: number;
	completionMessages: string[];
	sealed: SealedRefView | null;
	revision: number;
	schedule: TaskSchedule;
	timezoneOwnerUserId: string;
	lastCompletedAt: Date | null;
	completedCount: number;
	nextEligibleAt: Date | null;
	/** As on `SelfTaskView`. */
	windowCompletions: number | null;
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
	/** The owner's own balance, which completing a self task adds to. */
	credits: number;
};

export type HomePartnerTasksSectionView = {
	partnershipId: string;
	/** Where the browser reads what the viewer calls them (`partner-names.svelte.ts`). */
	names: PartnerNamesSource;
	image: string | null;
	tasks: PartnershipTaskView[];
	/** The viewer's balance in this partnership, which completing these adds to. */
	credits: number;
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
	/** Where the browser reads what the viewer calls them (`partner-names.svelte.ts`). */
	names: PartnerNamesSource;
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
	createdAt: Date;
};

/**
 * What a device fetches to open the identity: the public key and every wrap.
 *
 * Every account has keys — signup creates them, and a partner-assisted sign-in
 * replaces them — so there is no "not set up" state to carry.
 */
export type UnlockBundleView = {
	recipient: string;
	wraps: KeyWrapView[];
};

/**
 * The two public keys behind one partnership, for the safety number.
 *
 * Both are needed: pinning only theirs would miss a server that swapped
 * *yours*, which would make your partner encrypt to a key you do not hold.
 */
export type PartnerRecipientsView = {
	mine: string;
	theirs: string;
	/** The partnership vault's key check, once it has one. Pinned and in the safety number. */
	vaultCheck: string | null;
};

/** A vault key wrapped to one member. Opaque to the server. */
export type VaultWrapView = {
	ciphertext: string;
	/** The recipient it was wrapped to, so a stale wrap can be told from a broken one. */
	forRecipient: string;
};

/** A vault row as a device sees it: no key, only its public fingerprint. */
export type VaultRowView = {
	id: string;
	kind: VaultKind;
	partnershipId: string | null;
	keyCheck: string;
};

/**
 * Every vault this user can reach, what they hold of each, and what is
 * missing — enough for a device to open what it can and create or re-wrap the
 * rest. See `ensureVaults` in `crypto/vaults.svelte.ts`.
 */
export type VaultListingView = {
	/** The user's own recipient, as the server has it. */
	recipient: string;
	/** Null until the first device creates it. */
	self:
		| (VaultRowView & {
				wrap: VaultWrapView | null;
				/** The partnerships holding this vault in escrow. See docs/encryption.md, "Escrow". */
				escrowPartnershipIds: string[];
		  })
		| null;
	/** One entry per accepted partnership, with or without a vault yet. */
	partnerships: {
		partnershipId: string;
		partnerId: string;
		recipients: PartnerRecipientsView;
		vault:
			| (VaultRowView & {
					wrap: VaultWrapView | null;
					/** Which recipient the partner's wrap was made for, or null when they have none. */
					partnerWrapFor: string | null;
			  })
			| null;
	}[];
};

/**
 * Where one message body lives: enough to open it under either scheme.
 *
 * A row with a `vaultId` is sealed under that partnership vault (and its
 * sidecar too, when it has one); a row without is still in the original
 * scheme, age-encrypted to both partners, until a device migrates it. See
 * docs/messaging.md.
 */
export type MessageBodyRef = {
	id: string;
	/** Never rendered as text, even briefly. */
	ciphertext: string;
	vaultId: string | null;
	/** The sealed body's payload version. Null exactly when `vaultId` is. */
	payloadVersion: number | null;
	/** Cached derived metadata for the body, encrypted like the body. */
	metadataCiphertext: string | null;
	metadataVersion: number | null;
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
	preview: MessageBodyRef;
	/**
	 * Self-destructing media the viewer has not seen yet: files in their
	 * partner's messages since they last read the thread. Null when there is
	 * none, which includes every read thread.
	 */
	unseenMedia: UnseenMediaView | null;
};

/**
 * What a board tile needs to say "Image self-destructs in 3 days".
 *
 * The server knows when each file expires but not whether it is an image or a
 * video — that is inside the encrypted body — so it sends the bodies of the
 * messages carrying the files and the browser decrypts them to find out.
 */
export type UnseenMediaView = {
	/** The soonest expiry among the unseen files: the most urgent one. */
	expiresAt: Date;
	/** Each message with unseen files, and which of its attachments those are. */
	messages: (MessageBodyRef & { attachmentIds: string[] })[];
	/**
	 * More messages carry unseen files than are listed here, so the browser
	 * cannot know every kind and should say "media".
	 */
	truncated: boolean;
};

/**
 * A message tag. `name` is plaintext only on a tag made before sealing; a
 * sealed one has it in `sealed`, opened in the browser (`openedTagName` in
 * `sealed-views.svelte.ts`), and `name` is empty.
 */
export type TagView = {
	id: string;
	name: string;
	color: string;
	sealed: SealedRefView | null;
};

/** An attachment, as much of it as the server knows: an id and a size. */
export type AttachmentView = {
	id: string;
	byteSize: number;
	/** When it self-destructs; null for permanent media. */
	expiresAt: Date | null;
	/**
	 * Already self-destructed as of the load, so the browser does not ask for
	 * it at all. Worked out by the server, whose clock decides expiry.
	 */
	expired: boolean;
};

export type ReactionView = {
	/** The record id a sealed reaction is bound to. Chosen by the reacting browser. */
	id: string;
	/** Whether this is the viewer's own reaction, so it can be removed. */
	mine: boolean;
	ciphertext: string;
	vaultId: string | null;
	payloadVersion: number | null;
};

export type MessageView = MessageBodyRef & {
	/** Which side of the conversation. Resolved server-side, like partnerName. */
	mine: boolean;
	createdAt: Date;
	attachments: AttachmentView[];
	reactions: ReactionView[];
};

export type ThreadView = {
	id: string;
	icon: ThreadIcon;
	tags?: TagView[];
	messages: MessageView[];
	/**
	 * The viewer's own message the partner has most recently seen, for the read
	 * receipt, or null when there is none to show. See `seenMessageId` in
	 * `src/lib/messaging.ts`.
	 */
	seenMessageId: string | null;
};

/** One row on /home: a partner with something waiting. */
export type UnreadPartnerView = {
	partnershipId: string;
	/** Where the browser reads what the viewer calls them (`partner-names.svelte.ts`). */
	names: PartnerNamesSource;
	image: string | null;
	unreadThreads: number;
	newestAt: Date;
};

/** A claimed reward, as history. `sealed` as on `TaskCompletionView`. */
export type RewardHistoryView = {
	id: string;
	rewardTitle: string;
	rewardDescription: string | null;
	rewardCost: number;
	createdAt: Date;
	sealed: SealedRefView | null;
};

/** `title` and `description` as on `SelfTaskView`. */
export type SelfRewardView = {
	id: string;
	title: string;
	description: string | null;
	sealed: SealedRefView | null;
	revision: number;
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
	sealed: SealedRefView | null;
	revision: number;
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
	/** Where the browser reads what the viewer calls them (`partner-names.svelte.ts`). */
	names: PartnerNamesSource;
	image: string | null;
	credits: number;
	rewards: PartnershipRewardView[];
};

/**
 * A partner asking to have the shared history re-encrypted to a new key, as
 * part of a partner-assisted sign-in (see docs/account-recovery.md).
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
	/**
	 * True once another partner has already approved the sign-in, so this one
	 * is only about bringing back this partnership's history. The copy differs:
	 * the requester is already back in, and this partner should still check the
	 * code with them rather than trust whoever approved.
	 */
	signInApproved: boolean;
};

/**
 * A partner who cannot sign in and has asked the viewer for help, for the
 * callout the app shell shows on every screen. Just enough to link to the
 * board, where the code is compared and the request answered.
 */
export type HelpRequestView = {
	partnershipId: string;
	/** Where the browser reads what the viewer calls them (`partner-names.svelte.ts`). */
	names: PartnerNamesSource;
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
	/**
	 * Plaintext only for an item written before sealing; for a sealed one it is
	 * empty until a device opens `sealed` (`openedWidgetItem`).
	 */
	title: string;
	/** Which kind `sealed` opens as. A guide is never sealed: guides are the app's, not a user's. */
	kind: 'task' | 'reward' | 'guide' | 'daydream' | 'notebook';
	sealed: SealedRefView | null;
	/** A credit award, a cost — rendered as a pill, or omitted when null. */
	note: string | null;
	/**
	 * Whose section this row comes from on the full page, or null for your own.
	 *
	 * /home merges your things with every partner's into one list, so a row has
	 * to say which. Without it "Kneel at eight" and "Kneel at eight" from two
	 * different partners are the same line twice. The partner's names, opened in
	 * the browser, since the server cannot read them.
	 */
	context: PartnerNamesSource | null;
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
	/** Whose: the partner's names, opened in the browser. */
	label: PartnerNamesSource | null;
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

/** A daydream as the list shows it: its sealed setup (for the title) and when it was last played. */
export type DaydreamListItemView = {
	id: string;
	setup: SealedRefView;
	lastTurnAt: Date | null;
	createdAt: Date;
};

/** What the /home Daydreams card previews: the most recently played, and how many there are. */
export type DaydreamsWidgetView = {
	daydreams: DaydreamListItemView[];
	total: number;
};

/**
 * One turn's place in a daydream's tree: everything the server knows about it
 * but its content. The whole tree comes with the page, so the branch map and
 * the sibling switchers can be drawn without opening anything.
 */
export type DaydreamTreeNodeView = {
	id: string;
	parentId: string | null;
	role: DaydreamTurnRole;
	/** Depth in its branch; 0 for a root. */
	position: number;
	createdAt: Date;
};

/** A turn with its sealed content: the turns on the branch being read, and any opened on demand. */
export type DaydreamTurnView = DaydreamTreeNodeView & { sealed: SealedRefView };

/**
 * One request a daydream made to the model, and its answer, for debug mode's
 * raw log. Which passage it wrote (`turnId`, null for one that failed) and
 * what it answered (`parentTurnId`) are plaintext; the exchange is sealed.
 */
export type DaydreamExchangeView = {
	id: string;
	turnId: string | null;
	parentTurnId: string | null;
	createdAt: Date;
	sealed: SealedRefView;
};

/** A suggestion request that wrote a daydream's draft, for debug mode's raw log. All of it is sealed. */
export type DaydreamSetupExchangeView = {
	id: string;
	createdAt: Date;
	sealed: SealedRefView;
};

/** A bookmark or a reaction on a turn. What it is is sealed; which turn it marks is not. */
export type DaydreamMarkView = {
	id: string;
	turnId: string;
	revision: number;
	sealed: SealedRefView;
};

/**
 * A daydream as its own page shows it: the setup, the shape of the whole
 * tree, the sealed turns of the branch being read (root first), and the marks.
 */
export type DaydreamView = {
	id: string;
	revision: number;
	setup: SealedRefView;
	/** The end of the branch being read; null before the opening. */
	activeTurnId: string | null;
	tree: DaydreamTreeNodeView[];
	path: DaydreamTurnView[];
	marks: DaydreamMarkView[];
};

/** A character or idea in the user's library. `revision` is what a daydream's copy is compared with. */
export type DaydreamLibraryItemView = {
	id: string;
	revision: number;
	updatedAt: Date;
	sealed: SealedRefView;
};

export type DaydreamLibraryView = {
	characters: DaydreamLibraryItemView[];
	ideas: DaydreamLibraryItemView[];
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

/**
 * One past IQ test, as the history list and the /home card show it.
 *
 * The same shape whether it came from the account (a row of
 * `iq_test_results`) or from this device's own history, so the list does not
 * care which.
 */
export type IqTestResultView = {
	id: string;
	role: Role;
	intensity: Intensity;
	vibe: Vibe | null;
	iq: number;
	correct: number;
	attempted: number;
	skipped: number;
	/** Whether its results humiliated, and wore the vibe's look: see `iq_test_results`. */
	humiliating: boolean;
	themedLook: boolean;
	soberIq: number | null;
	targetIq: number | null;
	createdAt: Date;
	/**
	 * Device history only: the signed link a signed-out result is shared by
	 * (see `iq-test-share.ts`). An account's results are shared by their id.
	 */
	shareToken?: string;
};

/** A kink list as page data: its envelope and its sealed content. See docs/kink-list.md. */
export type KinkListView = {
	id: string;
	/** `'self'`, or the partnership id for a list shared with a partner. */
	scope: string;
	revision: number;
	editedAt: Date;
	sealed: SealedRefView;
};

/**
 * A notebook entry in a list or a card. The title and excerpt are sealed in
 * `header`, opened in the browser (`openedNotebookHeader`); null for an entry
 * hidden from the viewer that they may now show again, listed so they can.
 * See docs/notebook.md.
 */
export type NotebookEntryView = {
	id: string;
	kind: NotebookKind;
	entryDate: string | null;
	lastEditedAt: string;
	lastEditedByUserId: string | null;
	createdByUserId: string | null;
	access: EntryAccess;
	partnerAccess: PartnerAccess;
	header: SealedRefView | null;
};

/** One automatic version of a notebook entry, as its history lists it. */
export type NotebookVersionView = {
	id: string;
	upToSeq: number;
	createdAt: string;
	contributorUserIds: string[];
	restoredFromVersionId: string | null;
	createdByUserId: string | null;
};
