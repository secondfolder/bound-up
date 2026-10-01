import { describe, expect, it } from 'vitest';
import {
	buildPushContent,
	deviceLabel,
	isKnownPushService,
	parsePushPayload,
	pushTopic
} from './notifications';

const threadId = '0b5f6c1e-6a7d-4c43-9a3b-2f1f0e8d9c7b';
const url = 'https://app.test/partner/p/messages/t';

describe('buildPushContent', () => {
	it('says who sent a message, and nothing about what it said', () => {
		const content = buildPushContent({ kind: 'message', partnerName: 'Sam', threadId, url });
		expect(content.payload).toEqual({
			web_push: 8030,
			notification: {
				title: 'New message from Sam',
				navigate: url,
				tag: `thread-${threadId}`,
				lang: 'en'
			}
		});
		expect(content.payload.notification).not.toHaveProperty('body');
		expect(content.urgency).toBe('high');
	});

	it('words a new thread the same as a reply', () => {
		const thread = buildPushContent({ kind: 'thread', partnerName: 'Sam', threadId, url });
		const reply = buildPushContent({ kind: 'message', partnerName: 'Sam', threadId, url });
		expect(thread).toEqual(reply);
	});

	/**
	 * A topic on a reaction would let it replace a message still waiting at the
	 * push service, and its tag would let it hide one already on screen.
	 */
	it('keeps a reaction from replacing a message notification', () => {
		const reaction = buildPushContent({ kind: 'reaction', partnerName: 'Sam', threadId, url });
		const message = buildPushContent({ kind: 'message', partnerName: 'Sam', threadId, url });
		expect(reaction.payload.notification.title).toBe('Sam reacted to your message');
		expect(reaction.topic).toBeUndefined();
		expect(reaction.payload.notification.tag).not.toBe(message.payload.notification.tag);
		expect(reaction.urgency).toBe('normal');
	});
});

describe('pushTopic', () => {
	it('fits RFC 8030: at most 32 URL-safe characters', () => {
		const topic = pushTopic(threadId);
		expect(topic).toHaveLength(32);
		expect(topic).toMatch(/^[A-Za-z0-9_-]+$/);
	});
});

describe('parsePushPayload', () => {
	it('reads back what the server sends', () => {
		const { payload } = buildPushContent({ kind: 'message', partnerName: 'Sam', threadId, url });
		expect(parsePushPayload(payload)).toEqual(payload.notification);
	});

	/** WebKit revokes a subscription whose push shows nothing, so junk still gets a title. */
	it('falls back to a generic notification rather than nothing', () => {
		for (const junk of [null, 'text', {}, { notification: { title: 3 } }]) {
			expect(parsePushPayload(junk)).toEqual({
				title: 'Something new in Bound Up',
				navigate: '/home'
			});
		}
	});
});

describe('deviceLabel', () => {
	it.each([
		[
			'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1',
			0,
			'Safari on iPhone'
		],
		[
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15',
			5,
			'Safari on iPad'
		],
		[
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15',
			0,
			'Safari on Mac'
		],
		[
			'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
			5,
			'Chrome on Android'
		],
		[
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
			0,
			'Edge on Windows'
		],
		[
			'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
			0,
			'Firefox on Linux'
		],
		['curl/8.0', 0, 'Unknown device']
	])('%s → %s', (userAgent, touchPoints, label) => {
		expect(deviceLabel(userAgent, touchPoints)).toBe(label);
	});
});

describe('isKnownPushService', () => {
	it.each([
		'https://web.push.apple.com/QGuQyavXutnMH9cdJ8m',
		'https://fcm.googleapis.com/fcm/send/abc:def',
		'https://updates.push.services.mozilla.com/wpush/v2/gAAA',
		'https://wns2-par02p.notify.windows.com/w/?token=abc'
	])('accepts %s', (endpoint) => {
		expect(isKnownPushService(endpoint)).toBe(true);
	});

	it.each([
		'http://web.push.apple.com/x',
		'https://web.push.apple.com:444/x',
		'https://web.push.apple.com.evil.example/x',
		'https://notify.windows.com.evil.example/x',
		'https://localhost/x',
		'not a url'
	])('refuses %s', (endpoint) => {
		expect(isKnownPushService(endpoint)).toBe(false);
	});
});
