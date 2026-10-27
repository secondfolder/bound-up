import { render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageMetadataPayload, MessagePayload } from '$lib/crypto/messages';
import { waProp } from '$lib/testing/web-awesome';
import type { MessageBodyRef, ThreadStickerView } from '$lib/types';

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));

vi.mock('$lib/sticker', () => ({
	stickerStyle: () => '--jx: 0%; --jy: 0%; --tilt: 0deg;'
}));

vi.mock('$lib/crypto/session.svelte', () => ({
	currentKeyring: () => ({ status: 'unlocked', identity: 'secret' })
}));

/**
 * What each body opens to. The real opening goes through `sealedReader`,
 * covered by `sealed-cache.svelte.test.ts`; here a body says what the test
 * says, at once, as an opened record does once it has landed.
 */
const openedMessage = vi.fn<(ref: MessageBodyRef) => MessagePayload | null | undefined>();

const openedMessageMetadata =
	vi.fn<(ref: MessageBodyRef) => MessageMetadataPayload | null | undefined>();

const fetchAttachment =
	vi.fn<
		(
			partnershipId: string,
			info: MessagePayload['attachments'][number]
		) => Promise<{ url: string; blob: Blob }>
	>();

// The real error class, kept through the mock: the tile recognises a 410 with
// `instanceof`, so the error a test rejects with must be the very class the
// component imported.
vi.mock('$lib/messaging/client', async (importOriginal) => {
	const { MediaExpiredError } = await importOriginal<typeof import('$lib/messaging/client')>();
	return { openedMessage, openedMessageMetadata, fetchAttachment, MediaExpiredError };
});

const { default: ThreadSticker } = await import('./ThreadSticker.svelte');
const { MediaExpiredError } = await import('$lib/messaging/client');

/** A sealed body: the mocked `openedMessage` is what decides what it says. */
function bodyRef(ciphertext: string): MessageBodyRef {
	return {
		id: `m-${ciphertext}`,
		ciphertext,
		vaultId: 'v1',
		payloadVersion: 1,
		metadataCiphertext: null,
		metadataVersion: null
	};
}

/** A stored body of one plain paragraph. */
function prose(text: string): string {
	return JSON.stringify({
		root: {
			type: 'root',
			children: [{ type: 'paragraph', children: [{ type: 'text', text, format: 0 }] }]
		}
	});
}

function thread(overrides: Partial<ThreadStickerView> = {}): ThreadStickerView {
	return {
		id: 't1',
		icon: 'fire',
		unread: false,
		lastMessageAt: new Date('2026-09-13T14:15:00Z'),
		lastFullyReadAt: new Date('2026-09-12T18:00:00Z'),
		messageCount: 2,
		preview: bodyRef('ciphertext'),
		unseenMedia: null,
		...overrides
	};
}

const realDateTimeFormat = Intl.DateTimeFormat;

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-09-13T15:00:00Z'));
	openedMessage.mockReset();
	openedMessageMetadata.mockReset();
	fetchAttachment.mockReset();
	Intl.DateTimeFormat = class {
		readonly #options: Intl.DateTimeFormatOptions | undefined;

		constructor(_: string | string[] | undefined, options?: Intl.DateTimeFormatOptions) {
			this.#options = options;
		}

		format() {
			return this.#options?.hour ? 'TIME' : 'DATE';
		}
	} as unknown as typeof Intl.DateTimeFormat;
});

afterEach(() => {
	vi.useRealTimers();
	Intl.DateTimeFormat = realDateTimeFormat;
	vi.clearAllMocks();
});

describe('ThreadSticker', () => {
	it('shows a sealed envelope only for a never-opened unread thread', () => {
		openedMessage.mockReturnValue({ version: 1, text: prose('secret'), attachments: [] });
		const { container, queryByText } = render(ThreadSticker, {
			props: {
				thread: thread({ unread: true, lastFullyReadAt: null }),
				partnershipId: 'p1',
				position: 1,
				total: 1
			}
		});

		expect(waProp(container.querySelector('wa-icon'), 'name')).toBe('envelope');
		expect(queryByText('secret')).toBeNull();
		expect(openedMessage).not.toHaveBeenCalled();
	});

	it('shows a decrypted preview for a reopened unread thread instead of the envelope', async () => {
		openedMessage.mockReturnValue({ version: 1, text: prose('first whisper'), attachments: [] });
		const { container, findByText } = render(ThreadSticker, {
			props: {
				thread: thread({ unread: true, lastFullyReadAt: new Date('2026-09-12T18:00:00Z') }),
				partnershipId: 'p1',
				position: 1,
				total: 1
			}
		});

		await findByText('first whisper');
		expect(container.querySelector('wa-icon')).toBeNull();
	});

	it('shows a single text bubble full-size when the first message has only text', async () => {
		openedMessage.mockReturnValue({ version: 1, text: prose('soft words'), attachments: [] });

		const { container, findByText } = render(ThreadSticker, {
			props: {
				thread: thread(),
				partnershipId: 'p1',
				position: 1,
				total: 1
			}
		});

		await findByText('soft words');
		expect(container.querySelector('.fan')).toBeNull();
		expect(container.querySelector('.preview-single')).not.toBeNull();
		expect(container.querySelector('.single-card.text-bubble')).not.toBeNull();
	});

	it('prefers cached embed metadata for the board preview when present', async () => {
		openedMessage.mockReturnValue({
			version: 1,
			text: prose('https://example.com'),
			attachments: []
		});
		openedMessageMetadata.mockReturnValue({
			version: 1,
			embeds: [
				{
					href: 'https://example.com',
					fetchedAt: Date.now(),
					kind: 'card',
					providerName: 'Example',
					title: 'A richer preview',
					description: null,
					thumbnailUrl: 'https://example.com/thumb.jpg',
					canonicalUrl: 'https://example.com',
					imageUrl: null,
					iframeSrc: null,
					iframeHeight: null,
					faviconUrl: null,
					themeColor: null
				}
			]
		});

		const { container, findByText } = render(ThreadSticker, {
			props: {
				thread: thread({ preview: { ...bodyRef('ciphertext'), metadataCiphertext: 'metadata' } }),
				partnershipId: 'p1',
				position: 1,
				total: 1
			}
		});

		await findByText('A richer preview');
		expect(container.querySelector('.embed-preview')).not.toBeNull();
		expect(container.querySelector('.embed-thumb')).toHaveAttribute(
			'src',
			'https://example.com/thumb.jpg'
		);
	});

	it('shows a send time for today and an opened date when the latest message was read later', async () => {
		openedMessage.mockReturnValue({ version: 1, text: prose('meet me later'), attachments: [] });
		const { container, findByText } = render(ThreadSticker, {
			props: {
				thread: thread(),
				partnershipId: 'p1',
				position: 1,
				total: 1
			}
		});

		await findByText('meet me later');
		expect(container.querySelector('.meta')?.textContent).toContain('TIME');
		expect(container.querySelector('.meta')?.textContent).toContain('opened DATE');
	});

	it('shows a thumbnail when the first message is attachment-only', async () => {
		openedMessage.mockReturnValue({
			version: 1,
			text: '',
			attachments: [
				{
					id: 'a1',
					key: 'AGE-SECRET-KEY-1TEST',
					kind: 'image',
					mimeType: 'image/png',
					fileName: 'photo.png'
				}
			]
		});
		fetchAttachment.mockResolvedValue({ url: 'blob:thumb', blob: new Blob() });

		const { container } = render(ThreadSticker, {
			props: {
				thread: thread(),
				partnershipId: 'p1',
				position: 1,
				total: 1
			}
		});

		await waitFor(() => {
			const image = container.querySelector('img.thumb');
			expect(image).not.toBeNull();
			expect(image).toHaveAttribute('src', 'blob:thumb');
		});
		expect(container.querySelector('.preview-media')).not.toBeNull();
		expect(container.querySelector('.fan')).toBeNull();
	});

	it('fans multiple image thumbnails out with the text in its own bubble', async () => {
		openedMessage.mockReturnValue({
			version: 1,
			text: prose('soft words'),
			attachments: [
				{
					id: 'a1',
					key: 'AGE-SECRET-KEY-1TEST',
					kind: 'image',
					mimeType: 'image/png',
					fileName: 'one.png'
				},
				{
					id: 'a2',
					key: 'AGE-SECRET-KEY-1TEST2',
					kind: 'image',
					mimeType: 'image/png',
					fileName: 'two.png'
				}
			]
		});
		fetchAttachment
			.mockResolvedValueOnce({ url: 'blob:one', blob: new Blob() })
			.mockResolvedValueOnce({ url: 'blob:two', blob: new Blob() });

		const { container, findByText } = render(ThreadSticker, {
			props: {
				thread: thread(),
				partnershipId: 'p1',
				position: 1,
				total: 1
			}
		});

		await findByText('soft words');
		await waitFor(() => {
			expect(container.querySelectorAll('.media-card img.thumb')).toHaveLength(2);
		});
		expect(container.querySelector('.fan')).not.toBeNull();
		expect(container.querySelector('.text-bubble')).not.toBeNull();
	});

	it('shows a self-destructed attachment as the bomb, beside a sibling that still renders', async () => {
		openedMessage.mockReturnValue({
			version: 1,
			text: '',
			attachments: [
				{
					id: 'a1',
					key: 'AGE-SECRET-KEY-1TEST',
					kind: 'image',
					mimeType: 'image/png',
					fileName: 'gone.png'
				},
				{
					id: 'a2',
					key: 'AGE-SECRET-KEY-1TEST2',
					kind: 'image',
					mimeType: 'image/png',
					fileName: 'kept.png'
				}
			]
		});
		// The board has no attachment rows, so the download's 410 is how it
		// learns a file has gone — and one gone file must not blank the other.
		fetchAttachment.mockImplementation((_, info) =>
			info.id === 'a1'
				? Promise.reject(new MediaExpiredError())
				: Promise.resolve({ url: 'blob:kept', blob: new Blob() })
		);

		const { container, findByRole } = render(ThreadSticker, {
			props: {
				thread: thread(),
				partnershipId: 'p1',
				position: 1,
				total: 1
			}
		});

		const bomb = await findByRole('img', { name: 'This media has self-destructed' });
		// The compact version: no room on a tile for the caption.
		expect(bomb).toHaveClass('compact');
		expect(bomb.textContent).not.toContain('Kaboom');
		expect(bomb.closest('.media-card')).not.toBeNull();
		const images = container.querySelectorAll('.media-card img.thumb');
		expect(images).toHaveLength(1);
		expect(images[0]).toHaveAttribute('src', 'blob:kept');
	});

	describe('unseen self-destructing media', () => {
		const Hour = 60 * 60 * 1000;
		const unreadThread = (unseenMedia: ThreadStickerView['unseenMedia']) =>
			thread({ unread: true, lastFullyReadAt: null, unseenMedia });
		const payloadWith = (kinds: ('image' | 'video')[], ids: string[]) => ({
			version: 1 as const,
			text: '',
			attachments: kinds.map((kind, index) => ({
				id: ids[index] ?? `missing-${index}`,
				key: 'k',
				kind,
				mimeType: kind === 'image' ? 'image/png' : 'video/mp4',
				fileName: `f${index}`
			}))
		});
		const renderTile = (unseenMedia: ThreadStickerView['unseenMedia']) =>
			render(ThreadSticker, {
				props: { thread: unreadThread(unseenMedia), partnershipId: 'p1', position: 1, total: 1 }
			});

		it('names the kind and the soonest expiry, even on a sealed tile', async () => {
			openedMessage.mockReturnValue(payloadWith(['image'], ['a1']));
			const { container } = renderTile({
				expiresAt: new Date(Date.now() + 3 * 24 * Hour),
				messages: [{ ...bodyRef('c1'), attachmentIds: ['a1'] }],
				truncated: false
			});

			await waitFor(() =>
				expect(container.querySelector('.self-destructs')?.textContent?.trim()).toBe(
					'Image self-destructs in 3 days'
				)
			);
			expect(openedMessage).toHaveBeenCalledWith(expect.objectContaining({ ciphertext: 'c1' }));
			// The link's label is what a screen reader hears; the line itself is hidden.
			expect(container.querySelector('a')?.getAttribute('aria-label')).toContain(
				'image self-destructs in 3 days'
			);
			// Still sealed: the warning does not open the envelope.
			expect(waProp(container.querySelector('.preview-envelope wa-icon'), 'name')).toBe('envelope');
		});

		it('counts only the unseen files it was told about, across messages', async () => {
			openedMessage.mockImplementation((ref) =>
				ref.ciphertext === 'c1'
					? payloadWith(['video', 'image'], ['v1', 'seen'])
					: payloadWith(['video'], ['v2'])
			);
			const { container } = renderTile({
				expiresAt: new Date(Date.now() + 2 * Hour),
				messages: [
					{ ...bodyRef('c1'), attachmentIds: ['v1'] },
					{ ...bodyRef('c2'), attachmentIds: ['v2'] }
				],
				truncated: false
			});

			await waitFor(() =>
				expect(container.querySelector('.self-destructs')?.textContent?.trim()).toBe(
					'2 videos self-destruct in 2 hours'
				)
			);
		});

		it('says media when the list was cut short or a body will not open', async () => {
			openedMessage.mockReturnValue(payloadWith(['image'], ['a1']));
			const truncated = renderTile({
				expiresAt: new Date(Date.now() + Hour),
				messages: [{ ...bodyRef('c1'), attachmentIds: ['a1'] }],
				truncated: true
			});
			await waitFor(() =>
				expect(truncated.container.querySelector('.self-destructs')?.textContent?.trim()).toBe(
					'Media self-destructs in 1 hour'
				)
			);
			truncated.unmount();

			openedMessage.mockReturnValue(null);
			const unreadable = renderTile({
				expiresAt: new Date(Date.now() + Hour),
				messages: [{ ...bodyRef('c1'), attachmentIds: ['a1'] }],
				truncated: false
			});
			await waitFor(() =>
				expect(unreadable.container.querySelector('.self-destructs')?.textContent?.trim()).toBe(
					'Media self-destructs in 1 hour'
				)
			);
		});

		it('says nothing without unseen media, and drops the line once it has expired', async () => {
			const none = renderTile(null);
			expect(none.container.querySelector('.self-destructs')).toBeNull();
			none.unmount();

			openedMessage.mockReturnValue(payloadWith(['image'], ['a1']));
			const { container } = renderTile({
				expiresAt: new Date(Date.now() + 90 * 1000),
				messages: [{ ...bodyRef('c1'), attachmentIds: ['a1'] }],
				truncated: false
			});
			await waitFor(() => expect(container.querySelector('.self-destructs')).not.toBeNull());

			await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
			expect(container.querySelector('.self-destructs')).toBeNull();
		});
	});

	/** The thread a push notification's tap was about. See the board's `?thread=`. */
	describe('highlighted', () => {
		// Real timers: the fade is a real CSS animation, and `waitFor` polls on
		// timers the file's fake ones would freeze.
		beforeEach(() => {
			vi.useRealTimers();
			openedMessage.mockReturnValue({ version: 1, text: prose('hello'), attachments: [] });
		});
		afterEach(() => {
			vi.restoreAllMocks();
		});

		it('scrolls into view, rings the card, and says when the fade is over', async () => {
			const scrollIntoView = vi
				.spyOn(HTMLElement.prototype, 'scrollIntoView')
				.mockImplementation(() => undefined);
			const onHighlightEnd = vi.fn();
			const { container } = render(ThreadSticker, {
				props: {
					thread: thread({ unread: true, lastFullyReadAt: null }),
					partnershipId: 'p1',
					position: 1,
					total: 1,
					highlighted: true,
					onHighlightEnd
				}
			});

			const card = container.querySelector('.card') as HTMLElement;
			expect(card.hasAttribute('data-highlighted')).toBe(true);
			await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());

			// The real end of the CSS fade, rather than waiting four seconds for it.
			const [animation] = card.getAnimations();
			animation?.finish();
			await waitFor(() => expect(onHighlightEnd).toHaveBeenCalledOnce());
		});

		it('leaves an ordinary tile alone', () => {
			const scrollIntoView = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
			const { container } = render(ThreadSticker, {
				props: { thread: thread(), partnershipId: 'p1', position: 1, total: 1 }
			});
			expect(container.querySelector('[data-highlighted]')).toBeNull();
			expect(scrollIntoView).not.toHaveBeenCalled();
		});
	});
});
