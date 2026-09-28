import { render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageAttachmentInfo } from '$lib/crypto/messages';
import { defined } from '$lib/testing/defined';
import { waProp } from '$lib/testing/web-awesome';
import type { AttachmentView } from '$lib/types';

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));

const fetchAttachment =
	vi.fn<
		(partnershipId: string, info: MessageAttachmentInfo) => Promise<{ url: string; blob: Blob }>
	>();

/**
 * A stand-in for the real class, which the mocked module has to export too:
 * the component tells a 410 from any other failure with `instanceof`, so the
 * error a test rejects with must be the very class the component imported.
 * Not `importOriginal`, which would pull in the whole crypto client.
 */
class MediaExpiredError extends Error {}

vi.mock('$lib/messaging/client', () => ({ fetchAttachment, MediaExpiredError }));

/** What this browser can show, as the tests want it. Real Chromium says yes to both. */
const support = vi.hoisted(() => ({ avif: true, video: true }));

vi.mock('$lib/media/support', () => ({
	canDisplayAvif: () => Promise.resolve(support.avif),
	canPlayVideo: () => support.video
}));

const { default: AttachmentPreview } = await import('./AttachmentPreview.svelte');

const DAY = 24 * 60 * 60 * 1000;

const info: MessageAttachmentInfo = {
	id: 'a1',
	key: 'AGE-SECRET-KEY-1TEST',
	kind: 'image',
	mimeType: 'image/png',
	fileName: 'sunset.png'
};

function view(over: Partial<AttachmentView> = {}): AttachmentView {
	return { id: 'a1', byteSize: 100, expiresAt: null, expired: false, ...over };
}

const placeholderName = 'This media has self-destructed';

beforeEach(() => {
	fetchAttachment.mockReset();
	support.avif = true;
	support.video = true;
});

afterEach(() => {
	vi.useRealTimers();
});

describe('AttachmentPreview', () => {
	it('shows the self-destructed placeholder for expired media, without downloading it', async () => {
		const { getByRole, getByText, container } = render(AttachmentPreview, {
			props: { info, partnershipId: 'p1', view: view({ expired: true }) }
		});
		await tick();

		expect(getByRole('img', { name: placeholderName })).toBeInTheDocument();
		expect(getByText('Kaboom! This media has self-destructed.')).toBeInTheDocument();
		// The server already said it is gone; asking would only earn a 410.
		expect(fetchAttachment).not.toHaveBeenCalled();
		expect(container.querySelector('.countdown')).toBeNull();
	});

	it('treats a 410 from the download as self-destructed, not as a failure', async () => {
		fetchAttachment.mockRejectedValue(new MediaExpiredError());
		const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		try {
			const { findByRole, queryByText, container } = render(AttachmentPreview, {
				props: {
					info,
					partnershipId: 'p1',
					// Still live as far as the load knew: it expired in between.
					view: view({ expiresAt: new Date(Date.now() + DAY) })
				}
			});

			await findByRole('img', { name: placeholderName });
			expect(queryByText('Could not open this file.')).toBeNull();
			expect(container.querySelector('.countdown')).toBeNull();
			// Nothing went wrong, so nothing is logged as though it had.
			expect(error).not.toHaveBeenCalled();
		} finally {
			error.mockRestore();
		}
	});

	it('still reports any other download failure as one', async () => {
		fetchAttachment.mockRejectedValue(new Error('Could not download attachment (500)'));
		const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		try {
			const { findByText, queryByRole } = render(AttachmentPreview, {
				props: { info, partnershipId: 'p1', view: view() }
			});

			await findByText('Could not open this file.');
			expect(queryByRole('img', { name: placeholderName })).toBeNull();
		} finally {
			error.mockRestore();
		}
	});

	it('shows live media with how long it has left', async () => {
		fetchAttachment.mockResolvedValue({ url: 'blob:sunset', blob: new Blob() });
		const { findByRole, container } = render(AttachmentPreview, {
			props: {
				info,
				partnershipId: 'p1',
				view: view({ expiresAt: new Date(Date.now() + 3 * DAY) })
			}
		});

		const image = await findByRole('img', { name: 'sunset.png' });
		expect(image).toHaveAttribute('src', 'blob:sunset');
		// A badge over the media: it shows "in 3 days", and its bomb is the
		// word "Self-destructs" to a screen reader.
		const badge = defined(container.querySelector('.countdown'), 'the countdown badge');
		expect(badge.textContent?.trim()).toBe('in 3 days');
		expect(waProp(badge.querySelector('wa-icon'), 'label')).toBe('Self-destructs');
		expect(badge.closest('.media')).toBe(image.closest('.media'));
		expect(fetchAttachment).toHaveBeenCalledWith('p1', info);
	});

	it('shows no countdown for permanent media', async () => {
		fetchAttachment.mockResolvedValue({ url: 'blob:sunset', blob: new Blob() });
		const { findByRole, container, queryByText } = render(AttachmentPreview, {
			props: { info, partnershipId: 'p1', view: view({ expiresAt: null }) }
		});

		await findByRole('img', { name: 'sunset.png' });
		expect(container.querySelector('.countdown')).toBeNull();
		expect(queryByText(/^in \d/)).toBeNull();
	});

	it('turns into the placeholder when the countdown runs out with the thread open', async () => {
		// Only the interval and the clock: testing-library's own waiting runs on
		// `setTimeout`, which stays real.
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
		fetchAttachment.mockResolvedValue({ url: 'blob:sunset', blob: new Blob() });
		const { findByRole, queryByRole } = render(AttachmentPreview, {
			props: {
				info,
				partnershipId: 'p1',
				view: view({ expiresAt: new Date(Date.now() + 10_000) })
			}
		});
		await findByRole('img', { name: 'sunset.png' });
		expect(queryByRole('img', { name: placeholderName })).toBeNull();

		vi.advanceTimersByTime(30_000);

		await waitFor(() => {
			expect(queryByRole('img', { name: placeholderName })).not.toBeNull();
		});
		expect(queryByRole('img', { name: 'sunset.png' })).toBeNull();
	});
});

describe('AttachmentPreview video', () => {
	// With "metadata", Firefox suspends loading and some videos then sit at 0:00
	// when Play is pressed — see the comment at the element. The test browser is
	// Chromium, which does not have the bug, so what can be pinned here is the
	// attribute.
	it('asks the browser to load the whole video, which is already in memory', async () => {
		fetchAttachment.mockResolvedValue({ url: 'blob:clip', blob: new Blob() });
		const { container } = render(AttachmentPreview, {
			props: {
				info: { ...info, kind: 'video', mimeType: 'video/mp4', fileName: 'clip.mp4' },
				partnershipId: 'p1',
				view: view()
			}
		});
		const video = await waitFor(() => defined(container.querySelector('video'), 'the video'));
		expect(video.getAttribute('preload')).toBe('auto');
	});
});

describe('AttachmentPreview in a browser that cannot show the file', () => {
	const avif: MessageAttachmentInfo = { ...info, mimeType: 'image/avif', fileName: 'sunset.avif' };
	const webm: MessageAttachmentInfo = {
		...info,
		kind: 'video',
		mimeType: 'video/webm; codecs="vp09.00.10.08,opus"',
		fileName: 'clip.webm'
	};

	it('says to update the browser for an AVIF it cannot show, without downloading it', async () => {
		support.avif = false;
		const { findByText } = render(AttachmentPreview, {
			props: { info: avif, partnershipId: 'p1', view: view() }
		});

		expect(await findByText(/This photo can’t be shown in this browser/)).toBeInTheDocument();
		expect(await findByText(/Updating your browser should fix it/)).toBeInTheDocument();
		expect(fetchAttachment).not.toHaveBeenCalled();
	});

	it('says the same for a video it cannot play', async () => {
		support.video = false;
		const { findByText } = render(AttachmentPreview, {
			props: { info: webm, partnershipId: 'p1', view: view() }
		});

		expect(await findByText(/This video can’t be played in this browser/)).toBeInTheDocument();
		expect(fetchAttachment).not.toHaveBeenCalled();
	});

	it('shows an AVIF normally where the browser can', async () => {
		fetchAttachment.mockResolvedValue({ url: 'blob:avif', blob: new Blob() });
		const { container } = render(AttachmentPreview, {
			props: { info: avif, partnershipId: 'p1', view: view() }
		});
		await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
		expect(fetchAttachment).toHaveBeenCalledTimes(1);
	});

	// A HEIC sent as picked by an iPhone, say, which the type could not warn
	// about in advance.
	it('turns an image that fails to decode into the same warning', async () => {
		fetchAttachment.mockResolvedValue({ url: 'blob:heic', blob: new Blob() });
		const { container, findByText } = render(AttachmentPreview, {
			props: {
				info: { ...info, mimeType: 'image/heic', fileName: 'IMG_1.HEIC' },
				partnershipId: 'p1',
				view: view()
			}
		});
		const image = await waitFor(() => defined(container.querySelector('img'), 'the image'));
		image.dispatchEvent(new Event('error'));

		expect(await findByText(/This photo can’t be shown in this browser/)).toBeInTheDocument();
		expect(container.querySelector('img')).toBeNull();
	});
});
