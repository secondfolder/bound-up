import { fail } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { RewardInput } from '../rewards';
import { rewardSealedSubmitSchema } from '../schemas/rewardForm';
import { rewardContentSubmitSchema, taskContentSubmitSchema } from '../schemas/sealedContentForm';
import { type TaskSealedSubmit, taskSealedSubmitSchema } from '../schemas/taskEditorForm';
import type { SealedTaskContent } from '../tasks';

/**
 * Reading a task or reward form that arrives sealed, and answering it.
 *
 * The form's text never reaches the server (docs/tasks.md), so there is
 * nothing to send back into the fields: a refusal is a message, which the
 * page shows while keeping what was typed (`sealed-forms.ts`). Superforms
 * still parses the post, against the sealed schema.
 */

/**
 * Each reader takes the request, or its form data when the action has already
 * read it for a field of its own (a create's `spaceId`): a body can be read
 * only once.
 */
async function formDataOf(request: Request | FormData): Promise<FormData> {
	return request instanceof FormData ? request : await request.formData();
}

export async function readSealedTask(
	request: Request | FormData
): Promise<TaskSealedSubmit | null> {
	const form = await superValidate(await formDataOf(request), zod4(taskSealedSubmitSchema));
	return form.valid ? form.data : null;
}

/** A reward form, as posted: the plain fields and the sealed content. Null when malformed. */
export async function readSealedReward(
	request: Request | FormData
): Promise<{ recordId: string; expectedRevision: number; input: RewardInput } | null> {
	const formData = await formDataOf(request);
	const field = (key: string) => {
		const value = formData.get(key);
		return typeof value === 'string' && value !== '' ? value : undefined;
	};
	const parsed = rewardSealedSubmitSchema.safeParse({
		recordId: field('recordId'),
		vaultId: field('vaultId'),
		ciphertext: field('ciphertext'),
		payloadVersion: field('payloadVersion'),
		cost: field('cost'),
		active: formData.get('active') === 'on',
		expectedRevision: field('expectedRevision')
	});
	if (!parsed.success) {
		return null;
	}
	const { recordId, expectedRevision, vaultId, ciphertext, payloadVersion, cost, active } =
		parsed.data;
	return {
		recordId,
		expectedRevision: expectedRevision ?? 0,
		input: { cost, active, content: { vaultId, ciphertext, payloadVersion } }
	};
}

/** The fields of a post, as `safeParse` wants them: absent rather than empty. */
async function postedFields(request: Request): Promise<Record<string, string | undefined>> {
	const formData = await request.formData();
	const fields: Record<string, string | undefined> = {};
	for (const [key, value] of formData) {
		fields[key] = typeof value === 'string' && value !== '' ? value : undefined;
	}
	return fields;
}

/** A task's sealed content posted on its own (`taskContentSubmitSchema`). Null when malformed. */
export async function readSealedTaskContent(
	request: Request
): Promise<{ recordId: string; expectedRevision: number; content: SealedTaskContent } | null> {
	const parsed = taskContentSubmitSchema.safeParse(await postedFields(request));
	if (!parsed.success) {
		return null;
	}
	const { recordId, expectedRevision, ...content } = parsed.data;
	return { recordId, expectedRevision, content };
}

/** A reward's sealed content posted on its own (`rewardContentSubmitSchema`). Null when malformed. */
export async function readSealedRewardContent(
	request: Request
): Promise<{ recordId: string; expectedRevision: number; content: RewardInput['content'] } | null> {
	const parsed = rewardContentSubmitSchema.safeParse(await postedFields(request));
	if (!parsed.success) {
		return null;
	}
	const { recordId, expectedRevision, ...content } = parsed.data;
	return { recordId, expectedRevision, content };
}

/** The refusals a sealed write can meet, as something a person can act on. */
export function sealedRefusal(
	reason: string,
	what: 'task' | 'reward'
): ReturnType<typeof fail<{ error: string }>> {
	switch (reason) {
		case 'conflict':
			return fail(409, {
				error: `This ${what} was changed somewhere else since you opened it. Reload to see the latest, then make your change again.`
			});
		case 'wrong-vault':
			return fail(409, {
				error: 'Something changed since this page loaded. Reload and try again.'
			});
		case 'id-taken':
			return fail(409, {
				error: `This ${what} may already have been saved. Reload to check before trying again.`
			});
		case 'bad-timezone-owner':
			return fail(400, { error: 'That timezone selection does not match this partnership.' });
		case 'forbidden':
			return fail(403, {
				error: `Only whoever set this ${what} for someone else can change it.`
			});
		case 'not-a-member':
			return fail(404, {
				error: `That is not somewhere you can add a ${what}. Reload and try again.`
			});
		case 'no-assignee':
			return fail(400, {
				error: `There is nobody there to set this ${what} for yet. Reload and try again.`
			});
		default:
			return fail(400, { error: `That ${what} could not be saved. Reload and try again.` });
	}
}

/** A post that did not parse: a page out of date with the server, most likely. */
export function malformedSealed(what: 'task' | 'reward') {
	return fail(400, { error: `That ${what} could not be saved. Reload and try again.` });
}
