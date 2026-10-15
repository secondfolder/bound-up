import type { MailMessage } from './index';

/**
 * Every email this app sends. See docs/email.md.
 *
 * Plain and discreet on purpose: an inbox preview is seen by whoever is near
 * the screen, the same reasoning as the lock-screen rule in
 * docs/notifications.md. So no copy hints at what the app is for, and nothing
 * here ever includes anything the user wrote. The app's name and a verb, and
 * a link.
 */

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

/** Paragraphs and one button-like link; nothing a mail client might strip. */
function render(
	to: string,
	subject: string,
	parts: { lines: string[]; action?: { label: string; url: string }; after?: string[] }
): MailMessage {
	const text = [
		...parts.lines,
		...(parts.action ? [`${parts.action.label}: ${parts.action.url}`] : []),
		...(parts.after ?? [])
	].join('\n\n');
	const paragraph = (line: string) => `<p>${escapeHtml(line)}</p>`;
	const html = [
		'<!doctype html><html><body style="font-family: sans-serif; line-height: 1.5;">',
		...parts.lines.map(paragraph),
		parts.action
			? `<p><a href="${escapeHtml(parts.action.url)}">${escapeHtml(parts.action.label)}</a></p>` +
				`<p style="color: #666; font-size: 0.875em;">${escapeHtml(parts.action.url)}</p>`
			: '',
		...(parts.after ?? []).map(paragraph),
		'</body></html>'
	].join('');
	return { to, subject, text, html };
}

/** Better Auth's verification link, sent on sign-up and on an unverified sign-in. */
export function verificationEmail(to: string, url: string): MailMessage {
	return render(to, 'Confirm your email for Bound Up', {
		lines: ['Confirm this is your email address to finish setting up your Bound Up account.'],
		action: { label: 'Confirm my email', url },
		after: [
			'The link works for 24 hours. If you did not sign up, you can ignore this email and no account will be usable with this address.'
		]
	});
}

/**
 * Sent instead of a second account when someone signs up with an address that
 * already has one. The sign-up page says the same "check your email" either
 * way, so this is the only place that tells them, and only them.
 */
export function existingAccountEmail(to: string, loginUrl: string): MailMessage {
	return render(to, 'Someone tried to sign up for Bound Up with your email', {
		lines: [
			'Someone tried to create a Bound Up account with this email address, but you already have one.',
			'If it was you, sign in instead. If you have lost your password and passkeys, the sign-in page has a way back in.'
		],
		action: { label: 'Sign in', url: loginUrl },
		after: ['If it was not you, you can ignore this email. Nothing about your account changed.']
	});
}

/** The email half of partner-assisted sign-in (docs/account-recovery.md). */
export function recoveryConfirmEmail(to: string, url: string): MailMessage {
	return render(to, 'Confirm you are signing back in to Bound Up', {
		lines: [
			'Someone asked to sign back in to your Bound Up account with a new password, with a partner vouching for them.',
			'If that was you, confirm it here. Your partner still has to confirm it too.'
		],
		action: { label: 'Yes, this is me', url },
		after: [
			'If it was not you, do not open the link. Without it, the request cannot finish, and it expires within a day.'
		]
	});
}
