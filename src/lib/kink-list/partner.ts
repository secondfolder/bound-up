import { z } from 'zod';
import {
	type Answer,
	answerSchema,
	hasContent,
	type ItemKey,
	type ListPayload,
	listPayloadSchema,
	normaliseAnswers,
	type YourSide
} from './answers';

/**
 * A kink list shared with a partner: the rules. Pure and alias-free; see
 * docs/kink-list.md, "Partners".
 *
 * **It follows your own list.** A partner copy stores only what differs for
 * that partner — overrides — plus anything held back from them, and whether
 * comparing is blind. Everything else is your own list's answer.
 *
 * **Your partner cannot open your own list**, which is in your own vault, so
 * the copy also carries `resolved`: your own list with the overrides applied
 * and the held-back kinks taken out, sealed into the partnership's vault. That
 * is what your partner reads. It is worked out again, and sealed again,
 * whenever your own list or the copy changes (`resolvedFor`).
 */

const itemKey = z.string();
const at = z.number().int().nonnegative();

export const partnerPayloadSchema = z.object({
	/** Answers that differ for this partner. An empty one is an override taken back. */
	overrides: z.record(itemKey, answerSchema).transform(normaliseAnswers),
	/** Kinks not shown to this partner yet; `false` shows one again. */
	heldBack: z.record(itemKey, z.object({ held: z.boolean(), at })),
	/** Comparing shows only what you both want, and limits, if either of you turns this on. */
	blind: z.object({ on: z.boolean(), at }),
	/** What the partner sees: answers, custom kinks and wholesale limits. */
	resolved: listPayloadSchema.pick({ answers: true, custom: true, triage: true }),
	/** Your own list's revision when `resolved` was worked out, to know when it is stale. */
	soloRevision: z.number().int().nullable()
});
export type PartnerPayload = z.output<typeof partnerPayloadSchema>;
export type ResolvedList = PartnerPayload['resolved'];

export function emptyPartnerPayload(): PartnerPayload {
	return {
		overrides: {},
		heldBack: {},
		blind: { on: false, at: 0 },
		resolved: { answers: {}, custom: {}, triage: {} },
		soloRevision: null
	};
}

export function isOverridden(partner: PartnerPayload, key: ItemKey): boolean {
	return hasContent(partner.overrides[key]);
}

export function isHeld(partner: PartnerPayload, key: ItemKey): boolean {
	return partner.heldBack[key]?.held === true;
}

/** Your list as this partner's view shows it to you: your own, with the overrides in place. */
export function effectiveList(solo: ListPayload, partner: PartnerPayload): ListPayload {
	const answers = { ...solo.answers };
	for (const [key, answer] of Object.entries(partner.overrides)) {
		if (hasContent(answer)) {
			answers[key] = answer;
		}
	}
	return { ...solo, answers };
}

/** What your partner sees: the effective list, without anything held back. */
export function resolvedFor(solo: ListPayload, partner: PartnerPayload): ResolvedList {
	const effective = effectiveList(solo, partner);
	const answers: Record<string, Answer> = {};
	for (const [key, answer] of Object.entries(effective.answers)) {
		if (!isHeld(partner, key) && hasContent(answer)) {
			answers[key] = answer;
		}
	}
	const custom = Object.fromEntries(
		Object.entries(solo.custom).filter(([key, kink]) => !(kink.removed || isHeld(partner, key)))
	);
	const triage = Object.fromEntries(
		Object.entries(solo.triage).filter(([, entry]) => entry.value === 'limit')
	);
	return { answers, custom, triage };
}

/** A partner's resolved list, as a list the comparison and the read-only view take. */
export function asList(resolved: ResolvedList): ListPayload {
	return {
		answers: resolved.answers,
		custom: resolved.custom,
		triage: resolved.triage,
		// Nothing of theirs is hidden from a comparison: filters are a view on
		// your own list, not a choice about theirs.
		settings: { maxIntensity: 6, minCommonness: 0, side: 'both', at: 0 },
		skipped: {}
	};
}

/**
 * Which side a partner's view starts on, from who is in control
 * (`answerFromControl` in `partnership.ts`, from the viewer's side): whoever
 * holds control is usually the dom, so the view shows the contexts that
 * person fills in. Shared control hides nothing.
 */
export function sideFromControl(control: 'me' | 'them' | 'mix'): YourSide {
	if (control === 'me') {
		return 'dom';
	}
	return control === 'them' ? 'sub' : 'both';
}

/**
 * Where an answer given in a partner view goes. **A kink your own list has
 * not answered goes on your own list**, and the partner copy follows it, so
 * a list filled in from a partner's view is still yours everywhere. Only a
 * kink your own list has answered gets an override.
 */
export function answerTarget(solo: ListPayload, key: ItemKey): 'own' | 'override' {
	return hasContent(solo.answers[key]) ? 'override' : 'own';
}

/** Every kink whose answer differs for this partner, with both answers. */
export function differences(
	solo: ListPayload,
	partner: PartnerPayload
): { key: ItemKey; own: Answer | undefined; override: Answer }[] {
	return Object.entries(partner.overrides)
		.filter(([, answer]) => hasContent(answer))
		.map(([key, override]) => ({ key, own: solo.answers[key], override }));
}

function newer<T extends { at: number }>(a: T | undefined, b: T | undefined): T | undefined {
	if (!(a && b)) {
		return a ?? b;
	}
	return b.at > a.at ? b : a;
}

function mergeRecords<T extends { at: number }>(
	a: Record<string, T>,
	b: Record<string, T>
): Record<string, T> {
	const merged = { ...a };
	for (const [key, value] of Object.entries(b)) {
		const kept = newer(merged[key], value);
		if (kept) {
			merged[key] = kept;
		}
	}
	return merged;
}

/** Two copies of one partner copy as one, per kink by when each changed. `resolved` is worked out again after. */
export function mergePartnerPayloads(a: PartnerPayload, b: PartnerPayload): PartnerPayload {
	return {
		overrides: mergeRecords(a.overrides, b.overrides),
		heldBack: mergeRecords(a.heldBack, b.heldBack),
		blind: newer(a.blind, b.blind) ?? a.blind,
		resolved: a.resolved,
		soloRevision: a.soloRevision
	};
}
