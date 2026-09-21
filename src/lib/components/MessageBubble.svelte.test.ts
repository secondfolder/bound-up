import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import MessageBubble from './MessageBubble.svelte';
import type { MessageMetadataPayload, MessagePayload } from '$lib/crypto/messages';
import type { MessageView } from '$lib/types';

const observers: MockIntersectionObserver[] = [];

class MockIntersectionObserver {
	callback: IntersectionObserverCallback;
	elements = new Set<Element>();
	observe = vi.fn((element: Element) => {
		this.elements.add(element);
	});
	unobserve = vi.fn((element: Element) => {
		this.elements.delete(element);
	});
	disconnect = vi.fn(() => {
		this.elements.clear();
	});
	takeRecords = vi.fn(() => []);

	constructor(callback: IntersectionObserverCallback) {
		this.callback = callback;
		observers.push(this);
	}

	emit(element: Element, isIntersecting: boolean, intersectionRatio = 1) {
		this.callback(
			[
				{
					time: 0,
					target: element,
					isIntersecting,
					intersectionRatio,
					boundingClientRect: {
						top: 0,
						bottom: 120,
						left: 0,
						right: 120,
						width: 120,
						height: 120,
						x: 0,
						y: 0,
						toJSON: () => ({})
					},
					rootBounds: null,
					intersectionRect: {
						top: 0,
						bottom: isIntersecting ? 120 : 0,
						left: 0,
						right: isIntersecting ? 120 : 0,
						width: isIntersecting ? 120 : 0,
						height: isIntersecting ? 120 : 0,
						x: 0,
						y: 0,
						toJSON: () => ({})
					}
				} as IntersectionObserverEntry
			],
			this as unknown as IntersectionObserver
		);
	}
}

function installIntersectionObserverMock() {
	observers.length = 0;
	vi.stubGlobal(
		'IntersectionObserver',
		MockIntersectionObserver as unknown as typeof IntersectionObserver
	);
}

/**
 * jsdom never upgrades `wa-*` elements, so these assert on what the component
 * emits rather than on rendered behaviour — per AGENTS.md. Everything that
 * needs Web Awesome to actually work is in the Playwright suite.
 */

const CIPHERTEXT = 'YWdlLWVuY3J5cHRpb24ub3JnL3YxCg==SUPERSECRETCIPHERTEXT';

function message(over: Partial<MessageView> = {}): MessageView {
	return {
		id: 'm1',
		mine: false,
		ciphertext: CIPHERTEXT,
		bodyFormat: 'lexical',
		metadataCiphertext: null,
		createdAt: new Date('2026-01-01T12:00:00Z'),
		attachments: [],
		reactions: [],
		...over
	};
}

const props = {
	partnershipId: 'p1',
	when: '12:00',
	reactions: [],
	onEmbedActivated: vi.fn(),
	onRefreshEmbed: vi.fn(),
	onReact: vi.fn(),
	onClearReaction: vi.fn()
};

describe('MessageBubble', () => {
	/**
	 * THE assertion for this component. Rendering the ciphertext — even for a
	 * frame, even as a placeholder — would be the worst bug it could have, and
	 * it is the kind of thing a refactor introduces by reaching for the wrong
	 * field name.
	 */
	it('never renders the ciphertext, in any state', () => {
		for (const payload of [
			undefined,
			null,
			{ version: 1, text: 'the plaintext', attachments: [] } as MessagePayload
		]) {
			const { container, unmount } = render(MessageBubble, {
				props: { ...props, message: message(), payload, metadata: undefined }
			});
			expect(container.innerHTML).not.toContain('SUPERSECRETCIPHERTEXT');
			expect(container.innerHTML).not.toContain(CIPHERTEXT);
			unmount();
		}
	});

	it('shows a placeholder while decryption is in flight', () => {
		const { container } = render(MessageBubble, {
			props: { ...props, message: message(), payload: undefined, metadata: undefined }
		});
		expect(container.querySelector('.pending')).not.toBeNull();
		expect(container.querySelector('.text')).toBeNull();
	});

	// A real state, not an error: a thread can hold messages encrypted to a key
	// the user replaced after forgetting their password.
	it('explains an unreadable message rather than showing a blank bubble', () => {
		const { container, getByText } = render(MessageBubble, {
			props: { ...props, message: message(), payload: null, metadata: undefined }
		});
		expect(container.querySelector('.unreadable')).not.toBeNull();
		expect(getByText(/Ask your partner to restore your history/)).toBeTruthy();
	});

	it('renders the decrypted text once it arrives', () => {
		const { getByText } = render(MessageBubble, {
			props: {
				...props,
				message: message(),
				payload: { version: 1, text: 'meet me later', attachments: [] },
				metadata: undefined
			}
		});
		expect(getByText('meet me later')).toBeTruthy();
	});

	it('passes cached embed metadata through to the inline embed renderer', async () => {
		installIntersectionObserverMock();
		const fetchMock = vi.fn(() => new Promise(() => {}));
		vi.stubGlobal('fetch', fetchMock);
		const metadata: MessageMetadataPayload = {
			version: 1,
			embeds: [
				{
					href: 'https://vimeo.com/2',
					fetchedAt: Date.now(),
					kind: 'card',
					providerName: 'Vimeo',
					title: 'Cached title',
					description: null,
					thumbnailUrl: 'https://example.com/thumb.jpg',
					canonicalUrl: 'https://vimeo.com/2',
					imageUrl: null,
					iframeSrc: null,
					iframeHeight: null,
					faviconUrl: null,
					themeColor: null
				}
			]
		};

		const { container, findByText } = render(MessageBubble, {
			props: {
				...props,
				message: message(),
				payload: { version: 1, text: 'https://vimeo.com/2', attachments: [] },
				metadata
			}
		});

		// Cached details need no lookup, so the card is there from the start.
		await findByText('Cached title');
		expect(container.querySelector('.card')).not.toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('renders an embed the sender included, with no gate in front of it', () => {
		const metadata: MessageMetadataPayload = {
			version: 1,
			embeds: [
				{
					href: 'https://vimeo.com/2',
					fetchedAt: Date.now(),
					kind: 'card',
					providerName: 'Vimeo',
					title: 'Cached title',
					description: null,
					thumbnailUrl: 'https://example.com/thumb.jpg',
					canonicalUrl: 'https://vimeo.com/2',
					imageUrl: null,
					iframeSrc: null,
					iframeHeight: null,
					faviconUrl: null,
					themeColor: null
				}
			]
		};

		const { container, getByText } = render(MessageBubble, {
			props: {
				...props,
				message: message(),
				payload: { version: 1, text: 'https://vimeo.com/2', attachments: [] },
				metadata
			}
		});

		expect(container.querySelector('wa-button.reveal')).toBeNull();
		expect(getByText('Cached title')).toBeTruthy();
		expect(container.querySelector('.card')).not.toBeNull();
	});

	/**
	 * The reader's own opt-in, and the only `Show` button left. The sender put
	 * no embed on this URL, so the message renders as they wrote it until the
	 * reader asks for more.
	 */
	it('offers Show for a link the sender left without an embed', async () => {
		installIntersectionObserverMock();
		const fetchMock = vi.fn(() => new Promise(() => {}));
		vi.stubGlobal('fetch', fetchMock);
		const { container } = render(MessageBubble, {
			props: {
				...props,
				message: message(),
				payload: {
					version: 1,
					// A stored document with a link and deliberately no embed node.
					text: JSON.stringify({
						root: {
							type: 'root',
							children: [
								{
									type: 'paragraph',
									children: [
										{
											type: 'autolink',
											url: 'https://vimeo.com/2',
											children: [{ type: 'text', text: 'https://vimeo.com/2', format: 0 }]
										}
									]
								}
							]
						}
					}),
					attachments: []
				},
				metadata: null
			}
		});

		expect(container.querySelector('.url-embed')).toBeNull();
		await fireEvent.click(container.querySelector('wa-button.reveal')!);

		// The card goes at the start of the link's line, and the button that
		// asked for it is gone.
		const embed = container.querySelector('.embed-slot');
		expect(embed).not.toBeNull();
		expect(embed?.closest('p')).not.toBeNull();
		expect(container.querySelector('wa-button.reveal')).toBeNull();
	});

	it('waits for encrypted message metadata before starting a live embed fetch', () => {
		const fetchMock = vi.fn(() => new Promise(() => {}));
		vi.stubGlobal('fetch', fetchMock);

		const { container } = render(MessageBubble, {
			props: {
				...props,
				message: message({ metadataCiphertext: 'encrypted-metadata' }),
				payload: { version: 1, text: 'https://vimeo.com/2', attachments: [] },
				metadata: undefined
			}
		});

		expect(fetchMock).not.toHaveBeenCalled();
		expect(container.querySelector('.skeleton-shell')).not.toBeNull();
	});

	it('marks which side the message is on', () => {
		const theirs = render(MessageBubble, {
			props: { ...props, message: message({ mine: false }), payload: null, metadata: undefined }
		});
		expect(theirs.container.querySelector('li.theirs')).not.toBeNull();
		theirs.unmount();

		const mine = render(MessageBubble, {
			props: { ...props, message: message({ mine: true }), payload: null, metadata: undefined }
		});
		expect(mine.container.querySelector('li.mine')).not.toBeNull();
	});

	/**
	 * The requirement is reacting to messages you have *received*. The server
	 * refuses either way, but offering a control that cannot work is its own bug.
	 */
	it('offers no reaction control on your own message', () => {
		const { container } = render(MessageBubble, {
			props: { ...props, message: message({ mine: true }), payload: null, metadata: undefined }
		});
		expect(container.querySelector('.trigger')).toBeNull();
	});

	it('offers one on a message you received', () => {
		const { container } = render(MessageBubble, {
			props: { ...props, message: message({ mine: false }), payload: null, metadata: undefined }
		});
		expect(container.querySelector('.trigger')).not.toBeNull();
	});

	it('renders already-decrypted reactions and nothing when there are none', () => {
		const withReaction = render(MessageBubble, {
			props: {
				...props,
				message: message(),
				payload: null,
				metadata: undefined,
				reactions: [{ emoji: '🔥', mine: true }]
			}
		});
		expect(withReaction.container.querySelector('.reactions')?.textContent).toContain('🔥');
		withReaction.unmount();

		const without = render(MessageBubble, {
			props: { ...props, message: message(), payload: null, metadata: undefined }
		});
		expect(without.container.querySelector('.reactions')).toBeNull();
	});
});
