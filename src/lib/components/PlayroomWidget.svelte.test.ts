import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/svelte';
import type { IqTestResultView } from '$lib/types';
import PlayroomWidget from './PlayroomWidget.svelte';

const result: IqTestResultView = {
	id: 'r1',
	role: 'sub',
	intensity: 0,
	vibe: null,
	iq: 74,
	correct: 5,
	attempted: 12,
	skipped: 0,
	humiliating: true,
	themedLook: true,
	soberIq: null,
	targetIq: null,
	createdAt: new Date('2026-10-10T10:00:00Z')
};

describe('PlayroomWidget', () => {
	it('links to the Playroom and shows the last IQ result', () => {
		const { container } = render(PlayroomWidget, { latestIq: result, href: '/playroom' });
		expect(container.querySelector('a[href="/playroom"]')).toHaveTextContent('Playroom');
		expect(container).toHaveTextContent('Last IQ test: 74');
	});

	it('is a header on its own before any test has been taken', () => {
		const { container } = render(PlayroomWidget, { latestIq: null, href: '/playroom' });
		expect(container.querySelector('a[href="/playroom"]')).not.toBeNull();
		expect(container).not.toHaveTextContent('Last IQ test');
	});
});
