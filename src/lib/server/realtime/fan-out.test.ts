import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../testing/db';
import {
	createTestPartnership,
	createTestUser,
	type TestUser,
	testSoloSpace
} from '../../testing/fixtures';
import { publishListChange } from '../notebook-live';
import { publishToSpace } from './fan-out';
import { fanOutRooms, type Notifier, type RoomKey, type Watcher } from './index';
import { MESSAGES_TOPIC, publishMessagingEvent } from './messaging';

/**
 * Fanning a space's list-level events out to each member's own room, so an
 * Everyone page watches one stream rather than one per space. See
 * docs/realtime.md, "Everyone".
 */

/** A notifier that records every publish, and reports one watcher per room it is told of. */
function recordingNotifier(watching: Partial<Record<RoomKey, Watcher[]>> = {}) {
	const published: { room: RoomKey; topic: string; data: unknown }[] = [];
	const notifier: Notifier = {
		publish: (room, topic, data) => {
			published.push({ room, topic, data: JSON.parse(data) });
			return Promise.resolve(watching[room] ?? []);
		},
		stream: () => Promise.reject(new Error('not used')),
		presence: () => Promise.resolve(),
		evict: () => Promise.resolve()
	};
	return { notifier, published };
}

let harness: TestDb;
let ada: TestUser;
let bo: TestUser;
let partnershipId: string;

beforeEach(async () => {
	harness = await createTestDb();
	ada = await createTestUser(harness.db, { name: 'Ada' });
	bo = await createTestUser(harness.db, { name: 'Bo' });
	partnershipId = (await createTestPartnership(harness.db, ada, bo)).id;
});

afterEach(() => harness.close());

describe('fanOutRooms', () => {
	it("is the space's room and each member's own, once each", () => {
		expect(fanOutRooms('s-1', ['u-1', 'u-2', 'u-1'])).toEqual([
			'space:s-1',
			'user:u-1',
			'user:u-2'
		]);
	});
});

describe('publishToSpace', () => {
	it("reaches a shared space's room and both partners' own rooms", async () => {
		const { notifier, published } = recordingNotifier();
		await publishToSpace(notifier, harness.db, partnershipId, 'notebook', '{}');
		expect(new Set(published.map((frame) => frame.room))).toEqual(
			new Set([`space:${partnershipId}`, `user:${ada.id}`, `user:${bo.id}`])
		);
		expect(published).toHaveLength(3);
	});

	it("reaches a solo space's room and its owner's, and nobody else's", async () => {
		const solo = await testSoloSpace(harness.db, ada.id);
		const { notifier, published } = recordingNotifier();
		await publishToSpace(notifier, harness.db, solo, 'notebook', '{}');
		expect(published.map((frame) => frame.room)).toEqual([`space:${solo}`, `user:${ada.id}`]);
	});

	it('returns who was watching in every room it reached', async () => {
		const board: Watcher = { userId: ada.id, deviceId: 'a', streamId: 's-1' };
		const everyone: Watcher = { userId: bo.id, deviceId: 'b', streamId: 's-2' };
		const { notifier } = recordingNotifier({
			[`space:${partnershipId}`]: [board],
			[`user:${bo.id}`]: [everyone]
		});
		expect(await publishToSpace(notifier, harness.db, partnershipId, 'messages', '{}')).toEqual([
			board,
			everyone
		]);
	});
});

describe('publishMessagingEvent', () => {
	it("fans a board change out, saying which partnership's space it is in", async () => {
		const { notifier, published } = recordingNotifier();
		await publishMessagingEvent(notifier, harness.db, partnershipId, {
			kind: 'message',
			threadId: 't-1'
		});
		expect(published).toHaveLength(3);
		for (const frame of published) {
			expect(frame.topic).toBe(MESSAGES_TOPIC);
			expect(frame.data).toEqual({ kind: 'message', threadId: 't-1', spaceId: partnershipId });
		}
	});

	/** A read receipt is only shown on a thread page, which listens in the space's room. */
	it("sends a read event to the space's room alone", async () => {
		const { notifier, published } = recordingNotifier();
		await publishMessagingEvent(notifier, harness.db, partnershipId, {
			kind: 'read',
			threadId: 't-1'
		});
		expect(published.map((frame) => frame.room)).toEqual([`space:${partnershipId}`]);
	});

	it('carries nothing a caller attaches beyond the event', async () => {
		const { notifier, published } = recordingNotifier();
		await publishMessagingEvent(notifier, harness.db, partnershipId, {
			kind: 'thread',
			body: 'secret'
		} as never);
		expect(published[0]?.data).toEqual({ kind: 'thread', spaceId: partnershipId });
	});
});

describe('publishListChange', () => {
	it("tells a partnership's list and both partners' Everyone lists", async () => {
		const { notifier, published } = recordingNotifier();
		await publishListChange(notifier, harness.db, partnershipId);
		expect(new Set(published.map((frame) => frame.room))).toEqual(
			new Set([`space:${partnershipId}`, `user:${ada.id}`, `user:${bo.id}`])
		);
		expect(published).toHaveLength(3);
		expect(published.every((frame) => frame.topic === 'notebook')).toBe(true);
	});
});
