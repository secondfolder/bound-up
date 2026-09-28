import { render, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { TranscodeOptions } from '$lib/media/transcode';
import { NO_SENSITIVE_METADATA, type SensitiveMetadata } from '$lib/media-metadata';
import type { TranscodedQuality } from '$lib/media-quality';
import { MEDIA_TTL_DEFAULT_MS, MEDIA_TTL_NEVER } from '$lib/messaging';
import type { ComposedMessage } from '$lib/messaging/client';
import { defined } from '$lib/testing/defined';
import { waSettled } from '$lib/testing/web-awesome';
import MessageComposer from './MessageComposer.svelte';

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));

/**
 * The transcoder, held by the test: each call waits until the test finishes
 * it, so a test can look at the composer while a file is still compressing.
 * The real one is covered in `src/lib/media/transcode.svelte.test.ts`.
 */
type Job = {
	file: File;
	quality: TranscodedQuality;
	options: TranscodeOptions;
	finish: (out?: File) => void;
};
const jobs = vi.hoisted(() => [] as Job[]);

vi.mock('$lib/media/transcode', () => ({
	transcodeFile: (file: File, quality: TranscodedQuality, options: TranscodeOptions = {}) =>
		new Promise<File>((resolve, reject) => {
			// As the real queue does. It also keeps a job from a composer that an
			// earlier test unmounted out of this test's list.
			if (options.signal?.aborted) {
				reject(options.signal.reason);
				return;
			}
			options.signal?.addEventListener('abort', () => reject(options.signal?.reason), {
				once: true
			});
			jobs.push({
				file,
				quality,
				options,
				finish: (out) =>
					resolve(out ?? new File([new Uint8Array(1)], `${quality}.avif`, { type: 'image/avif' }))
			});
		})
}));

/**
 * What each picked file's metadata says, by file name; anything unlisted has
 * none. The real reader is covered in `src/lib/media/metadata.svelte.test.ts`.
 */
const metadata = vi.hoisted(() => new Map<string, SensitiveMetadata>());

vi.mock('$lib/media/metadata', () => ({
	readSensitiveMetadata: (file: File) =>
		Promise.resolve(metadata.get(file.name) ?? NO_SENSITIVE_METADATA)
}));

const PHONE_PHOTO: SensitiveMetadata = {
	location: true,
	device: 'Apple iPhone 15 Pro',
	takenAt: null,
	owner: null
};

const HOUR = 60 * 60 * 1000;
const MB = 1024 * 1024;

function mount(props: { permanentMedia?: boolean; highQualityMedia?: boolean } = {}) {
	jobs.length = 0;
	metadata.clear();
	const send = vi.fn<(message: ComposedMessage) => Promise<string | null>>(async () => null);
	const result = render(MessageComposer, { props: { send, ...props } });
	return { send, ...result };
}

type PickOptions = { type?: string; bytes?: number };

/** Picks a file the way the browser's file dialog hands one over. */
function attach(
	container: HTMLElement,
	name = 'sunset.png',
	{ type = 'image/png', bytes = 3 }: PickOptions = {}
) {
	const input = defined(
		container.querySelector<HTMLInputElement>('input[type="file"]'),
		'the hidden file input'
	);
	const transfer = new DataTransfer();
	transfer.items.add(new File([new Uint8Array(bytes)], name, { type }));
	input.files = transfer.files;
	input.dispatchEvent(new Event('change', { bubbles: true }));
}

function rows(container: HTMLElement): HTMLElement[] {
	return [...container.querySelectorAll<HTMLElement>('.attachments > li')];
}

function row(container: HTMLElement, index = 0): HTMLElement {
	return defined(rows(container)[index], `attachment row ${index}`);
}

function ttlTrigger(within: HTMLElement): HTMLElement {
	return defined(
		within.querySelector<HTMLElement>('wa-dropdown wa-button[slot="trigger"]'),
		'the self-destruct trigger'
	);
}

function qualityButton(within: HTMLElement): HTMLElement | null {
	return within.querySelector<HTMLElement>('wa-button.quality');
}

function ttlItems(within: HTMLElement): HTMLElement[] {
	return [...within.querySelectorAll<HTMLElement>('wa-dropdown-item')];
}

/**
 * Chooses a lifetime through the dropdown's own event.
 *
 * `wa-select` with the item in its detail is exactly what the dropdown
 * dispatches for a click or a key press on an item, and it is the one thing
 * the composer listens for — so dispatching it tests the composer's half
 * without depending on the popup's open animation.
 */
async function chooseTtl(within: HTMLElement, label: string) {
	const item = defined(
		ttlItems(within).find((candidate) => candidate.textContent?.trim() === label),
		`the "${label}" item`
	);
	defined(within.querySelector('wa-dropdown'), 'the self-destruct menu').dispatchEvent(
		new CustomEvent('wa-select', { detail: { item } })
	);
	await waitFor(() => expect(ttlTrigger(within).textContent).toContain(label));
}

/** What a sighted user reads: the text minus anything only a screen reader gets. */
function visibleText(element: HTMLElement): string {
	const copy = element.cloneNode(true) as HTMLElement;
	for (const hidden of copy.querySelectorAll('.wa-visually-hidden')) {
		hidden.remove();
	}
	return copy.textContent?.trim() ?? '';
}

function sendButton(container: HTMLElement): HTMLElement {
	return defined(
		[...container.querySelectorAll<HTMLElement>('.row > wa-button')].find(
			(button) => button.textContent?.trim() === 'Send'
		),
		'the Send button'
	);
}

function problemText(container: HTMLElement): string | undefined {
	return container.querySelector('wa-callout')?.textContent?.trim();
}

/** The `index`th transcode, once the composer has got round to asking for it. */
async function job(index = 0): Promise<Job> {
	await waitFor(() => expect(jobs.length).toBeGreaterThan(index));
	return defined(jobs[index], `transcode job ${index}`);
}

async function attachAndSettle(container: HTMLElement, name?: string, options?: PickOptions) {
	const before = rows(container).length;
	attach(container, name, options);
	await waitFor(() => expect(rows(container).length).toBe(before + 1));
	await waSettled(container);
}

describe('MessageComposer attachment rows', () => {
	it('shows each file as a bin, a thumbnail and a self-destruct menu', async () => {
		const { container } = mount();
		await waSettled(container);
		expect(rows(container)).toEqual([]);

		await attachAndSettle(container, 'sunset.png');
		await attachAndSettle(container, 'clip.mp4', { type: 'video/mp4' });

		const first = row(container, 0);
		expect(first.querySelector('wa-icon[name="trash-can"]')).not.toBeNull();
		expect(first.querySelector('img')?.getAttribute('alt')).toBe('sunset.png');
		expect(first.querySelector('img')?.getAttribute('src')).toMatch(/^blob:/);
		expect(row(container, 1).querySelector('video')).not.toBeNull();
		// Defaults to two weeks, said on the trigger along with whose it is.
		expect(visibleText(ttlTrigger(first))).toBe('2 weeks');
		expect(ttlTrigger(first).textContent).toContain('sunset.png self-destructs after');
		// No file name or size text any more: the thumbnail is the file.
		expect(visibleText(first)).not.toContain('sunset.png');
	});

	it('removes a file with its bin, and stops compressing it', async () => {
		const { container } = mount();
		await attachAndSettle(container, 'sunset.png');
		const pending = await job();

		defined(row(container).querySelector<HTMLElement>('wa-button'), 'the bin').click();

		await waitFor(() => expect(rows(container)).toEqual([]));
		expect(pending.options.signal?.aborted).toBe(true);
	});

	it('starts compressing as soon as a file is picked, not when Send is pressed', async () => {
		const { container, send } = mount();
		await attachAndSettle(container, 'sunset.png');

		const pending = await job();
		expect([pending.file.name, pending.quality]).toEqual(['sunset.png', 'low']);
		expect(send).not.toHaveBeenCalled();
		// Its progress shows over the thumbnail while it works.
		pending.options.onProgress?.(0.4);
		await waitFor(() =>
			expect(row(container).querySelector('.busy')?.textContent?.trim()).toBe('40%')
		);

		pending.finish();
		await waitFor(() => expect(row(container).querySelector('.busy')).toBeNull());
	});

	it('sends the compressed file, not the one picked', async () => {
		const { container, send } = mount();
		await attachAndSettle(container, 'sunset.png');
		const compressed = new File([new Uint8Array(1)], 'sunset.avif', { type: 'image/avif' });
		(await job()).finish(compressed);
		await waitFor(() => expect(row(container).querySelector('.busy')).toBeNull());

		sendButton(container).click();

		await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
		const [message] = defined(send.mock.calls[0], 'the send call');
		expect(message.attachments.map((attachment) => attachment.file)).toEqual([compressed]);
		expect(message.highQualityMedia).toBe(false);
	});

	it('waits for a file still compressing when Send is pressed, and says so', async () => {
		const { container, send } = mount();
		await attachAndSettle(container, 'sunset.png');

		sendButton(container).click();
		await waitFor(() =>
			expect(container.querySelector('.progress')?.textContent).toBe('Compressing 1 file… (0%)')
		);
		expect(send).not.toHaveBeenCalled();

		(await job()).finish();
		await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(rows(container)).toEqual([]));
	});
});

describe('MessageComposer self-destruct per file', () => {
	it('sends two weeks for a file whose lifetime is not chosen, without permanent media', async () => {
		const { container, send } = mount();
		await attachAndSettle(container, 'party.gif', { type: 'image/gif' });

		sendButton(container).click();

		await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
		expect(send.mock.calls[0]?.[0].attachments.map((a) => a.mediaTtl)).toEqual([
			MEDIA_TTL_DEFAULT_MS
		]);
	});

	it('sends each file with its own lifetime, and a new file starts on the default', async () => {
		const { container, send } = mount();
		await attachAndSettle(container, 'one.gif', { type: 'image/gif' });
		await attachAndSettle(container, 'two.gif', { type: 'image/gif' });

		await chooseTtl(row(container, 0), '1 hour');
		expect(visibleText(ttlTrigger(row(container, 1)))).toBe('2 weeks');
		sendButton(container).click();

		await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
		const [message] = defined(send.mock.calls[0], 'the send call');
		expect(message.attachments.map((a) => [a.file.name, a.mediaTtl])).toEqual([
			['one.gif', HOUR],
			['two.gif', MEDIA_TTL_DEFAULT_MS]
		]);

		await waitFor(() => expect(rows(container)).toEqual([]));
		await attachAndSettle(container, 'three.gif', { type: 'image/gif' });
		expect(visibleText(ttlTrigger(row(container)))).toBe('2 weeks');
	});

	it('offers "Never" only to an account with permanent media, and starts it there', async () => {
		const without = mount();
		await attachAndSettle(without.container);
		expect(ttlItems(row(without.container)).map((item) => item.textContent?.trim())).toEqual([
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
		await attachAndSettle(withFeature.container, 'forever.gif', { type: 'image/gif' });
		expect(ttlItems(row(withFeature.container)).map((item) => item.textContent?.trim())).toContain(
			'Never'
		);
		expect(visibleText(ttlTrigger(row(withFeature.container)))).toBe('Never');

		sendButton(withFeature.container).click();
		await waitFor(() => expect(withFeature.send).toHaveBeenCalledTimes(1));
		expect(withFeature.send.mock.calls[0]?.[0].attachments[0]?.mediaTtl).toBe(MEDIA_TTL_NEVER);
	});
});

describe('MessageComposer quality button', () => {
	it('is never shown without higher quality uploads, and every file compresses to SD', async () => {
		const { container } = mount();
		await attachAndSettle(container);
		expect(qualityButton(row(container))).toBeNull();
		expect((await job()).quality).toBe('low');
	});

	it('starts on HD for the feature, and cycles SD → HD → Original with a click', async () => {
		const { container } = mount({ highQualityMedia: true });
		await attachAndSettle(container, 'sunset.png');
		const button = defined(qualityButton(row(container)), 'the quality button');
		expect(visibleText(button)).toBe('HD');
		// Read in full by a screen reader, so the words must not run together.
		expect(button.textContent?.replace(/\s+/g, ' ').trim()).toBe('Quality of sunset.png: HD');
		expect(ttlTrigger(row(container)).textContent?.replace(/\s+/g, ' ').trim()).toBe(
			'sunset.png self-destructs after 2 weeks'
		);
		expect((await job()).quality).toBe('high');

		button.click();
		await waitFor(() => expect(visibleText(button)).toBe('Original'));
		button.click();
		await waitFor(() => expect(visibleText(button)).toBe('SD'));
		button.click();
		await waitFor(() => expect(visibleText(button)).toBe('HD'));
	});

	it('abandons an unfinished encode it has moved away from, and reuses a finished one', async () => {
		const { container } = mount({ highQualityMedia: true });
		await attachAndSettle(container, 'sunset.png');
		const button = defined(qualityButton(row(container)), 'the quality button');
		(await job()).finish();
		await waitFor(() => expect(row(container).querySelector('.busy')).toBeNull());

		// Original: nothing to encode.
		button.click();
		await waitFor(() => expect(visibleText(button)).toBe('Original'));
		// SD: a new encode.
		button.click();
		const sd = await job(1);
		expect(sd.quality).toBe('low');
		// Back round to HD before SD finishes.
		button.click();
		await waitFor(() => expect(visibleText(button)).toBe('HD'));

		expect(sd.options.signal?.aborted).toBe(true);
		// HD was already done, so it is not encoded again.
		expect(jobs).toHaveLength(2);
		expect(row(container).querySelector('.busy')).toBeNull();
	});

	it('sends the chosen tier for each file', async () => {
		const { container, send } = mount({ highQualityMedia: true });
		await attachAndSettle(container, 'sunset.png');
		const button = defined(qualityButton(row(container)), 'the quality button');
		button.click();
		await waitFor(() => expect(visibleText(button)).toBe('Original'));

		sendButton(container).click();

		await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
		const [message] = defined(send.mock.calls[0], 'the send call');
		// Original is the file as picked, byte for byte.
		expect(message.attachments[0]?.file.name).toBe('sunset.png');
		expect(message.highQualityMedia).toBe(true);
	});

	// Compressing is also what strips EXIF, which nobody would guess.
	it('names what the metadata shares, beside the button, while the file is Original', async () => {
		const { container } = mount({ highQualityMedia: true });
		metadata.set('IMG_0001.jpg', PHONE_PHOTO);
		await attachAndSettle(container, 'IMG_0001.jpg', { type: 'image/jpeg' });
		(await job()).finish();
		const warning = () => row(container).querySelector('.metadata-warning');
		// Compressed: none of it goes, so nothing to say.
		await waitFor(() => expect(row(container).querySelector('.busy')).toBeNull());
		expect(warning()).toBeNull();

		const button = defined(qualityButton(row(container)), 'the quality button');
		button.click();
		await waitFor(() =>
			expect(visibleText(defined(warning(), 'the warning') as HTMLElement)).toBe(
				'Shares where it was taken and the device (Apple iPhone 15 Pro)'
			)
		);
		expect(warning()?.querySelector('wa-icon[name="triangle-exclamation"]')).not.toBeNull();
		// Straight after the quality button, in the same row.
		expect(button.nextElementSibling).toBe(warning());
		expect(warning()?.textContent).toContain('IMG_0001.jpg:');

		button.click();
		await waitFor(() => expect(warning()).toBeNull());
	});

	it('says nothing for an Original whose metadata gives nothing away', async () => {
		const { container } = mount({ highQualityMedia: true });
		await attachAndSettle(container, 'plain.jpg', { type: 'image/jpeg' });
		defined(qualityButton(row(container)), 'the quality button').click();
		await waitFor(() =>
			expect(visibleText(qualityButton(row(container)) as HTMLElement)).toBe('Original')
		);
		// Give the metadata read its turn before deciding it said nothing.
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(row(container).querySelector('.metadata-warning')).toBeNull();
	});

	// A GIF is never compressed, so it takes its metadata along at any quality.
	it('warns for a file sent as picked at SD too', async () => {
		const { container } = mount();
		metadata.set('party.gif', PHONE_PHOTO);
		await attachAndSettle(container, 'party.gif', { type: 'image/gif' });
		await waitFor(() =>
			expect(row(container).querySelector('.metadata-warning')?.textContent).toContain(
				'where it was taken'
			)
		);
	});
});

describe('MessageComposer size checks', () => {
	it('does not refuse a large video while it is being compressed', async () => {
		const { container } = mount({ highQualityMedia: true });
		await attachAndSettle(container, 'clip.mov', { type: 'video/quicktime', bytes: 16 * MB });
		expect(problemText(container)).toBeUndefined();

		// At Original it goes as picked, so its size is known now, and it is over.
		defined(qualityButton(row(container)), 'the quality button').click();
		await waitFor(() => expect(problemText(container)).toMatch(/Videos have to be under/));
	});

	it('refuses once the compressed file turns out too big', async () => {
		const { container } = mount();
		await attachAndSettle(container, 'clip.mov', { type: 'video/quicktime' });
		(await job()).finish(new File([new Uint8Array(11 * MB)], 'clip.webm', { type: 'video/webm' }));
		await waitFor(() => expect(problemText(container)).toMatch(/more than 10 MB/));
	});

	it('refuses a large file that is never compressed, like a GIF, at once', async () => {
		const { container } = mount();
		await attachAndSettle(container, 'party.gif', { type: 'image/gif', bytes: 11 * MB });
		await waitFor(() => expect(problemText(container)).toMatch(/more than 10 MB/));
	});
});
