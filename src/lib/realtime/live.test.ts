import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defined } from '$lib/testing/defined';

/**
 * The browser half of presence: every stream carries an id, renews its lease
 * while open, and says goodbye as it closes. See the note at the top of
 * `live.ts` for why the server needs telling.
 *
 * Node, with `document`, `EventSource` and `sendBeacon` stood in for, because
 * what is under test is which requests go out and when, not a real stream.
 */

vi.mock('$lib/push-client', () => ({ storedPushDeviceId: () => 'device-1' }));

const { watchPartnership } = await import('$lib/messaging/live');

class FakeEventSource {
	static opened: FakeEventSource[] = [];
	readonly url: string;
	closed = false;
	readonly listeners = new Map<string, (message: { data: string }) => void>();
	onopen: (() => void) | null = null;
	onerror: (() => void) | null = null;
	addEventListener(type: string, listener: (message: { data: string }) => void) {
		this.listeners.set(type, listener);
	}
	constructor(url: string) {
		this.url = url;
		FakeEventSource.opened.push(this);
	}
	close() {
		this.closed = true;
	}
}

let visibility: 'visible' | 'hidden' = 'visible';
const listeners = new Set<() => void>();
const beacons: { url: string; body: { room: string; stream: string; present: boolean } }[] = [];

beforeEach(() => {
	vi.useFakeTimers();
	visibility = 'visible';
	listeners.clear();
	beacons.length = 0;
	FakeEventSource.opened = [];
	vi.stubGlobal('EventSource', FakeEventSource);
	vi.stubGlobal('document', {
		get visibilityState() {
			return visibility;
		},
		addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
		removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener)
	});
	vi.stubGlobal('navigator', {
		sendBeacon: (url: string, body: string) => {
			beacons.push({ url, body: JSON.parse(body) });
			return true;
		}
	});
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

function setVisibility(next: 'visible' | 'hidden') {
	visibility = next;
	for (const listener of listeners) {
		listener();
	}
}

/** The stream id a connection was opened with. */
function streamOf(source: FakeEventSource | undefined): string {
	const url = new URL(defined(source, 'an opened stream').url, 'https://app.test');
	return defined(url.searchParams.get('stream'), 'the stream id');
}

describe('watchPartnership: presence', () => {
	it('opens each stream with an id of its own and the push device', () => {
		const stop = watchPartnership({ partnershipId: 'p-1', onChange: () => undefined });

		const url = new URL(defined(FakeEventSource.opened[0], 'the stream').url, 'https://app.test');
		expect(url.pathname).toBe('/api/realtime/events');
		expect(url.searchParams.get('room')).toBe('partnership:p-1');
		expect(url.searchParams.getAll('topic')).toEqual(['messages']);
		expect(url.searchParams.get('stream')).toMatch(/^[0-9a-f-]{36}$/);
		expect(url.searchParams.get('device')).toBe('device-1');
		stop();
	});

	it('renews the lease while the stream is open', () => {
		const stop = watchPartnership({ partnershipId: 'p-1', onChange: () => undefined });
		const stream = streamOf(FakeEventSource.opened[0]);

		vi.advanceTimersByTime(25_000 * 3);

		expect(beacons).toEqual(
			Array.from({ length: 3 }, () => ({
				url: '/api/realtime/presence',
				body: { room: 'partnership:p-1', stream, present: true }
			}))
		);
		stop();
	});

	/** The case that broke: a phone leaving the board stayed listed as watching it. */
	it('says goodbye when torn down, and stops renewing', () => {
		const stop = watchPartnership({ partnershipId: 'p-1', onChange: () => undefined });
		const stream = streamOf(FakeEventSource.opened[0]);

		stop();
		vi.advanceTimersByTime(25_000 * 3);

		expect(beacons.map((beacon) => beacon.body)).toEqual([
			{ room: 'partnership:p-1', stream, present: false }
		]);
		expect(FakeEventSource.opened[0]?.closed).toBe(true);
	});

	it('says goodbye when hidden, and comes back as a new stream', () => {
		const stop = watchPartnership({ partnershipId: 'p-1', onChange: () => undefined });
		const first = streamOf(FakeEventSource.opened[0]);

		setVisibility('hidden');
		expect(beacons.map((beacon) => beacon.body)).toEqual([
			{ room: 'partnership:p-1', stream: first, present: false }
		]);

		setVisibility('visible');
		const second = streamOf(FakeEventSource.opened[1]);
		// A new id, so a goodbye for the old stream can never close the new one,
		// whichever reaches the server first.
		expect(second).not.toBe(first);
		stop();
	});
});

describe('watchPartnership: frames', () => {
	it('hands a message frame on, parsed', () => {
		const events: unknown[] = [];
		const stop = watchPartnership({
			partnershipId: 'p-1',
			onChange: (event) => events.push(event)
		});
		const source = defined(FakeEventSource.opened[0], 'the stream');

		defined(
			source.listeners.get('messages'),
			'the messages listener'
		)({
			data: JSON.stringify({ kind: 'message', threadId: 't-1' })
		});

		expect(events).toEqual([{ kind: 'message', threadId: 't-1' }]);
		stop();
	});

	it('catches up once a dropped stream opens again', () => {
		const events: unknown[] = [];
		const stop = watchPartnership({
			partnershipId: 'p-1',
			onChange: (event) => events.push(event)
		});
		defined(FakeEventSource.opened[0], 'the first stream').onerror?.();

		vi.advanceTimersByTime(2000);
		const second = defined(FakeEventSource.opened[1], 'the second stream');
		expect(events).toEqual([]);
		second.onopen?.();

		expect(events).toEqual([null]);
		stop();
	});
});
