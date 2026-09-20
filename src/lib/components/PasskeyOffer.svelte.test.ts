import { describe, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';

let mockOffer: { userId: string; recipient: string } | null = null;
const dismiss = vi.fn();

vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));

vi.mock('$lib/crypto/session.svelte', () => ({
	currentEnrolmentOffer: () => mockOffer,
	dismissEnrolmentOffer: dismiss,
	enrolmentIdentityFor: () => 'AGE-SECRET-KEY-1TEST'
}));

const { default: PasskeyOffer } = await import('./PasskeyOffer.svelte');

describe('PasskeyOffer', () => {
	test('says nothing when there is no offer standing', () => {
		mockOffer = null;
		render(PasskeyOffer);
		expect(screen.queryByText('Unlock with a passkey next time?')).not.toBeInTheDocument();
	});

	test('offers the passkey, and a way to decline it', async () => {
		mockOffer = { userId: 'usr-1', recipient: 'age1mine' };
		render(PasskeyOffer);

		expect(screen.getByText('Unlock with a passkey next time?')).toBeInTheDocument();
		expect(screen.getByText('Set it up')).toBeInTheDocument();

		// Declining has to be as easy as accepting: this appears after an unlock
		// the user did not ask to be interrupted from.
		screen.getByText('Not now').click();
		expect(dismiss).toHaveBeenCalled();
	});

	test('posts to the action that already knows how to store a wrap', () => {
		mockOffer = { userId: 'usr-1', recipient: 'age1mine' };
		const { container } = render(PasskeyOffer);

		const form = container.querySelector('form')!;
		expect(form.getAttribute('action')).toBe('/settings/encryption?/addWrap');
		// Filled in by the submit handler once the ceremony has produced them.
		expect(form.querySelector('input[name="wrapBlob"]')).toBeInTheDocument();
		expect(form.querySelector('input[name="wrapParams"]')).toBeInTheDocument();
	});
});
