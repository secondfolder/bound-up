import { describe, expect, it, test } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { type SuperValidated, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { z } from 'zod';
import { type PartnerInviteFormSchema, partnerInviteFormSchema } from '$lib/schemas/partnerForm';
import { waByProp, waProp, waSettled } from '$lib/testing/web-awesome';
import PartnerAcceptForm from './PartnerAcceptForm.svelte';

/**
 * `PartnerFields` is exercised through this component rather than on its own,
 * because `superForm()` registers an `onDestroy` and so can only be called
 * during component initialisation — a test cannot build one and pass it in.
 * Going through the real wrapper also means the composition is under test.
 *
 * What these cover is the UI half of the permission rule: which answers the
 * accepter can change. The other half — the server ignoring what a read-only
 * form posts back — is in the invite page's server test.
 */

function formData(
	overrides: Partial<z.output<PartnerInviteFormSchema>> = {}
): Promise<SuperValidated<z.output<PartnerInviteFormSchema>>> {
	return superValidate(
		{
			partnerName: 'Ada',
			yourName: 'Jun',
			partnerRole: 'dom',
			yourRole: 'sub',
			control: 'mix' as const,
			...overrides
		},
		zod4(partnerInviteFormSchema),
		{ errors: false }
	);
}

const radio = (value: string): HTMLInputElement => {
	const found = document.querySelector<HTMLInputElement>(`input[name="control"][value="${value}"]`);
	if (!found) {
		throw new Error(`no control radio for ${value}`);
	}
	return found;
};

const controlValues = () =>
	[...document.querySelectorAll('input[name="control"]')].map((el) => el.getAttribute('value'));

const waInputNames = (container: HTMLElement) =>
	[...container.querySelectorAll('wa-input')].map((el) => waProp(el, 'name'));

const waInput = (container: HTMLElement, name: string) => {
	const [found] = waByProp(container, 'wa-input', 'name', name);
	if (!found) {
		throw new Error(`no wa-input named ${name}`);
	}
	return found;
};

describe('when the accepter is allowed to edit', () => {
	it('renders the names and roles as inputs', async () => {
		const { container } = render(PartnerAcceptForm, { data: await formData(), editable: true });
		expect(waInputNames(container)).toEqual(['partnerName', 'yourName', 'partnerRole', 'yourRole']);
	});

	it('groups the fields under their section titles', async () => {
		const { container } = render(PartnerAcceptForm, { data: await formData(), editable: true });
		const legends = [...container.querySelectorAll('legend')].map((el) => el.textContent?.trim());
		expect(legends).toEqual(['Name/Title', 'Roles', 'Who calls the shots?']);
		expect(container.textContent).toContain('How should you both refer to each other?');
		expect(container.querySelectorAll('.inline-fields')).toHaveLength(1);
		expect(container.querySelectorAll('.stacked-fields')).toHaveLength(1);
	});

	it('labels each field theirs or yours', async () => {
		const { container } = render(PartnerAcceptForm, { data: await formData(), editable: true });
		const labels = [...container.querySelectorAll('wa-input')].map((el) => waProp(el, 'label'));
		expect(labels).toEqual(['Theirs', 'Yours', 'Theirs', 'Yours']);
	});

	it('offers exactly the three control answers, in that order', async () => {
		render(PartnerAcceptForm, { data: await formData(), editable: true });
		expect(controlValues()).toEqual(['me', 'them', 'mix']);
	});

	it('preselects the answer that came from the server', async () => {
		render(PartnerAcceptForm, { data: await formData({ control: 'them' }), editable: true });
		expect(radio('them')).toBeChecked();
		expect(radio('me')).not.toBeChecked();
	});

	it('lets the control answer be changed', async () => {
		render(PartnerAcceptForm, { data: await formData({ control: 'mix' }), editable: true });
		await fireEvent.click(radio('me'));
		expect(radio('me')).toBeChecked();
		expect(radio('mix')).not.toBeChecked();
	});

	it('renders the values the server prefilled, not blank fields', async () => {
		// The regression this guards: InputField had no `value` at all, so every
		// prefilled form came up empty and then posted those blanks back.
		//
		// Asserted on what the form would actually POST. `wa-input` is
		// form-associated, so its value only reaches the FormData if the element
		// genuinely upgraded — which a simulated DOM could never show.
		const { container } = render(PartnerAcceptForm, { data: await formData(), editable: true });
		const form = container.querySelector('form');
		if (!form) {
			throw new Error('missing form');
		}
		await waSettled(container);
		const posted = new FormData(form);
		expect({
			partnerName: posted.get('partnerName'),
			yourName: posted.get('yourName'),
			partnerRole: posted.get('partnerRole'),
			yourRole: posted.get('yourRole')
		}).toEqual({
			partnerName: 'Ada',
			yourName: 'Jun',
			partnerRole: 'dom',
			yourRole: 'sub'
		});
	});

	it('shows each role input with a dimmed name prefix from its matching name field', async () => {
		const { container } = render(PartnerAcceptForm, { data: await formData(), editable: true });
		expect(waInput(container, 'partnerRole').textContent).toContain("Jun's");
		expect(waInput(container, 'yourRole').textContent).toContain("Ada's");
	});

	it('renders an absent role as an empty field, not the string "null"', async () => {
		const { container } = render(PartnerAcceptForm, {
			data: await formData({ partnerRole: null }),
			editable: true
		});
		expect(waProp(waInput(container, 'partnerRole'), 'value')).toBe('');
	});

	it('emits no hidden duplicates of the visible fields', async () => {
		const { container } = render(PartnerAcceptForm, { data: await formData(), editable: true });
		expect(container.querySelectorAll('input[type="hidden"]')).toHaveLength(0);
	});
});

describe('when the inviter keeps control', () => {
	it('shows the answers as text instead of inputs', async () => {
		const { container } = render(PartnerAcceptForm, { data: await formData(), editable: false });

		expect(waInputNames(container)).toEqual([]);
		expect(screen.getByText('Ada')).toBeInTheDocument();
		expect(screen.getByText('Jun')).toBeInTheDocument();
		expect(screen.getByText("Jun's dom")).toBeInTheDocument();
		expect(screen.getByText("Ada's sub")).toBeInTheDocument();
	});

	it('still submits every value, so the payload matches the same schema', async () => {
		const { container } = render(PartnerAcceptForm, {
			data: await formData({ control: 'them' }),
			editable: false
		});

		const hidden = Object.fromEntries(
			[...container.querySelectorAll<HTMLInputElement>('input[type="hidden"]')].map((el) => [
				el.name,
				el.value
			])
		);
		expect(hidden).toEqual({
			partnerName: 'Ada',
			yourName: 'Jun',
			partnerRole: 'dom',
			yourRole: 'sub',
			control: 'them'
		});
	});

	it('omits the control question entirely rather than showing disabled radios', async () => {
		// Someone who cannot change the answer is not asked it — a row of
		// disabled radios is noise, not information.
		render(PartnerAcceptForm, { data: await formData(), editable: false });
		expect(document.querySelectorAll('input[name="control"][type="radio"]')).toHaveLength(0);
		expect(screen.queryByText('Who calls the shots?')).not.toBeInTheDocument();
	});

	it('leaves the roles section values out when there are none', async () => {
		render(PartnerAcceptForm, {
			data: await formData({ partnerRole: null, yourRole: null }),
			editable: false
		});
		expect(screen.queryByText('dom')).not.toBeInTheDocument();
		expect(screen.queryByText('sub')).not.toBeInTheDocument();
	});

	it('sends an empty string rather than "null" for a missing role', async () => {
		// `value={null}` would serialise as the literal string "null" and be
		// stored as a role reading null.
		const { container } = render(PartnerAcceptForm, {
			data: await formData({ partnerRole: null, yourRole: null }),
			editable: false
		});
		expect(container.querySelector<HTMLInputElement>('input[name="partnerRole"]')?.value).toBe('');
		expect(container.querySelector<HTMLInputElement>('input[name="yourRole"]')?.value).toBe('');
	});
});

test('the form posts back to the invite URL it was served from', async () => {
	const { container } = render(PartnerAcceptForm, { data: await formData(), editable: true });
	const form = container.querySelector('form');
	expect(form).toHaveAttribute('method', 'POST');
	// No `action`: the default action on the current URL is what carries the
	// token, which lives in the path.
	expect(form?.hasAttribute('action')).toBe(false);
});
