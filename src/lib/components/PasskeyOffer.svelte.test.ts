import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';
import { defined } from '$lib/testing/defined';
import { waSettled } from '$lib/testing/web-awesome';

let mockOffer: { userId: string; recipient: string } | null = null;
const dismiss = vi.fn();

vi.mock('$app/forms', () => ({ enhance: () => ({ destroy: () => undefined }) }));

vi.mock('$lib/crypto/session.svelte', () => ({
	currentEnrolmentOffer: () => mockOffer,
	dismissEnrolmentOffer: dismiss,
	enrolmentIdentityFor: () => 'AGE-SECRET-KEY-1TEST'
}));

const { default: PasskeyOffer } = await import('./PasskeyOffer.svelte');

describe('PasskeyOffer', () => {
	it('says nothing when there is no offer standing', () => {
		mockOffer = null;
		render(PasskeyOffer);
		expect(screen.queryByText('Unlock with a passkey next time?')).not.toBeInTheDocument();
	});

	it('offers the passkey, and a way to decline it', async () => {
		mockOffer = { userId: 'usr-1', recipient: 'age1mine' };
		const { container } = render(PasskeyOffer);
		// `wa-button` forwards `click()` to the native button it renders, which
		// does not exist until its first update.
		await waSettled(container);

		expect(screen.getByText('Unlock with a passkey next time?')).toBeInTheDocument();
		expect(screen.getByText('Set it up')).toBeInTheDocument();

		// Declining has to be as easy as accepting: this appears after an unlock
		// the user did not ask to be interrupted from.
		screen.getByText('Not now').click();
		expect(dismiss).toHaveBeenCalled();
	});

	it('posts to the action that already knows how to store a wrap', () => {
		mockOffer = { userId: 'usr-1', recipient: 'age1mine' };
		const { container } = render(PasskeyOffer);

		const form = defined(container.querySelector('form'), 'the offer form');
		expect(form.getAttribute('action')).toBe('/settings/encryption?/addWrap');
		// Filled in by the submit handler once the ceremony has produced them.
		expect(form.querySelector('input[name="wrapBlob"]')).toBeInTheDocument();
		expect(form.querySelector('input[name="wrapParams"]')).toBeInTheDocument();
	});
});
