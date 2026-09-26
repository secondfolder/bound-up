import { render, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { MEDIA_TTL_DEFAULT_MS, MEDIA_TTL_NEVER } from '$lib/messaging';
import type { ComposedMessage } from '$lib/messaging/client';
import { defined } from '$lib/testing/defined';
import { waSettled } from '$lib/testing/web-awesome';
import MessageComposer from './MessageComposer.svelte';

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));

const HOUR = 60 * 60 * 1000;

function mount(props: { permanentMedia?: boolean } = {}) {
	const send = vi.fn<(message: ComposedMessage) => Promise<string | null>>(async () => null);
	const result = render(MessageComposer, { props: { send, ...props } });
	return { send, ...result };
}

/** Picks a file the way the browser's file dialog hands one over. */
function attach(container: HTMLElement, name = 'sunset.png') {
	const input = defined(
		container.querySelector<HTMLInputElement>('input[type="file"]'),
		'the hidden file input'
	);
	const transfer = new DataTransfer();
	transfer.items.add(new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' }));
	input.files = transfer.files;
	input.dispatchEvent(new Event('change', { bubbles: true }));
}

function picker(container: HTMLElement): HTMLElement | null {
	return container.querySelector<HTMLElement>('.ttl wa-dropdown');
}

function trigger(container: HTMLElement): HTMLElement {
	return defined(
		container.querySelector<HTMLElement>('.ttl wa-button[slot="trigger"]'),
		'the self-destruct trigger'
	);
}

function items(container: HTMLElement): HTMLElement[] {
	return [...container.querySelectorAll<HTMLElement>('.ttl wa-dropdown-item')];
}

/**
 * Chooses a lifetime through the dropdown's own event.
 *
 * `wa-select` with the item in its detail is exactly what the dropdown
 * dispatches for a click or a key press on an item, and it is the one thing
 * the composer listens for — so dispatching it tests the composer's half
 * without depending on the popup's open animation.
 */
async function choose(container: HTMLElement, label: string) {
	const item = defined(
		items(container).find((candidate) => candidate.textContent?.trim() === label),
		`the "${label}" item`
	);
	defined(picker(container), 'the self-destruct picker').dispatchEvent(
		new CustomEvent('wa-select', { detail: { item } })
	);
	await waitFor(() => {
		expect(trigger(container).textContent).toContain(label);
	});
}

function sendButton(container: HTMLElement): HTMLElement {
	return defined(
		[...container.querySelectorAll<HTMLElement>('.row > wa-button')].find(
			(button) => button.textContent?.trim() === 'Send'
		),
		'the Send button'
	);
}

describe('MessageComposer self-destruct picker', () => {
	it('is not offered until there is a file to self-destruct', async () => {
		const { container } = mount();
		await waSettled(container);
		expect(picker(container)).toBeNull();

		attach(container);
		await waitFor(() => {
			expect(picker(container)).not.toBeNull();
		});
		await waSettled(container);
		// Defaults to two weeks, said on the trigger.
		expect(trigger(container).textContent).toContain('2 weeks');
		expect(trigger(container).textContent).toContain('Self-destructs after');
	});

	it('sends two weeks when nothing is chosen, without permanent media', async () => {
		const { container, send } = mount();
		attach(container);
		await waitFor(() => expect(picker(container)).not.toBeNull());
		await waSettled(container);

		sendButton(container).click();

		await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
		expect(send.mock.calls[0]?.[0]).toMatchObject({ mediaTtl: MEDIA_TTL_DEFAULT_MS });
		expect(MEDIA_TTL_DEFAULT_MS).toBe(1_209_600_000);
	});

	it('sends the chosen preset, then goes back to the default', async () => {
		const { container, send } = mount();
		attach(container);
		await waitFor(() => expect(picker(container)).not.toBeNull());
		await waSettled(container);

		await choose(container, '1 hour');
		sendButton(container).click();

		await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
		const [message] = defined(send.mock.calls[0], 'the send call');
		expect(message.mediaTtl).toBe(HOUR);
		expect(message.files.map((file) => file.name)).toEqual(['sunset.png']);

		// A short lifetime is per message: the next file starts at two weeks.
		await waitFor(() => expect(picker(container)).toBeNull());
		attach(container, 'another.png');
		await waitFor(() => expect(picker(container)).not.toBeNull());
		await waSettled(container);
		expect(trigger(container).textContent).toContain('2 weeks');
	});

	it('offers "Never" only to an account with permanent media', async () => {
		const without = mount();
		attach(without.container);
		await waitFor(() => expect(picker(without.container)).not.toBeNull());
		const labels = items(without.container).map((item) => item.textContent?.trim());
		expect(labels).toEqual([
			'1 hour',
			'6 hours',
			'1 day',
			'3 days',
			'1 week',
			'2 weeks',
			'30 days'
		]);
		without.unmount();

		const withFeature = mount({ permanentMedia: true });
		attach(withFeature.container);
		await waitFor(() => expect(picker(withFeature.container)).not.toBeNull());
		expect(items(withFeature.container).map((item) => item.textContent?.trim())).toContain('Never');
	});

	it('starts an account with permanent media on "Never", and sends that untouched', async () => {
		const { container, send } = mount({ permanentMedia: true });
		attach(container);
		await waitFor(() => expect(picker(container)).not.toBeNull());
		await waSettled(container);
		expect(trigger(container).textContent).toContain('Never');

		sendButton(container).click();

		await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
		expect(send.mock.calls[0]?.[0]).toMatchObject({ mediaTtl: MEDIA_TTL_NEVER });
	});

	it('goes back to "Never" after a send with a shorter choice, for permanent media', async () => {
		const { container, send } = mount({ permanentMedia: true });
		attach(container);
		await waitFor(() => expect(picker(container)).not.toBeNull());
		await waSettled(container);

		await choose(container, '1 day');
		sendButton(container).click();
		await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
		expect(send.mock.calls[0]?.[0]).toMatchObject({ mediaTtl: 24 * HOUR });

		await waitFor(() => expect(picker(container)).toBeNull());
		attach(container, 'another.png');
		await waitFor(() => expect(picker(container)).not.toBeNull());
		await waSettled(container);
		expect(trigger(container).textContent).toContain('Never');
	});
});
