import { describe, expect, it } from 'vitest';
import { linkIn } from '$lib/testing/mail';
import { existingAccountEmail, recoveryConfirmEmail, verificationEmail } from './templates';

describe('email templates', () => {
	const url =
		'https://app.test/api/auth/verify-email?token=abc.def&callbackURL=%2Flogin%3Fverified%3D1';
	const all = [
		verificationEmail('ada@example.test', url),
		existingAccountEmail('ada@example.test', url),
		recoveryConfirmEmail('ada@example.test', url)
	];

	it('puts the link in both bodies, escaped in the HTML one', () => {
		for (const mail of all) {
			expect(mail.to).toBe('ada@example.test');
			expect(linkIn(mail).href).toBe(url);
			expect(mail.html).toContain('token=abc.def&amp;callbackURL=');
			expect(mail.html).not.toContain('&callbackURL=');
		}
	});

	/**
	 * An inbox preview is seen by whoever is near the screen, so nothing says
	 * what the app is for — the same rule as a lock-screen notification.
	 */
	it('says nothing about what the app is for', () => {
		for (const mail of all) {
			expect(`${mail.subject} ${mail.text}`).not.toMatch(
				/partner'?s? (?:task|reward)|edge|sex|kink|message from/i
			);
		}
	});
});
