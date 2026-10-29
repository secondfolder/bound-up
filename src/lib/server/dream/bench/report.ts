/**
 * The bench's written output: a summary to start from, and every run in full
 * (each prompt as sent, each reply as received) to read (docs/dreams.md,
 * "Quality tools").
 *
 * Alias-free, for the bench.
 */

import type { BenchRun } from './run';

function percent(part: number, whole: number): string {
	return whole ? `${Math.round((part / whole) * 100)}%` : '–';
}

function firstLine(text: string): string {
	return (
		text
			.split('\n')
			.find((line) => line.trim())
			?.trim()
			.slice(0, 80) ?? ''
	);
}

/** Variety across the runs of one brief on one model: how many came out different. */
function variety(runs: readonly BenchRun[]): string {
	const distinct = (values: (string | null | undefined)[]): number =>
		new Set(values.filter(Boolean).map((value) => value?.toLowerCase())).size;
	const names = runs.flatMap((run) =>
		(run.build?.elements ?? [])
			.filter((element) => element.type === 'character')
			.map((element) => element.name)
	);
	const nameCounts = new Map<string, number>();
	for (const name of names) {
		nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
	}
	const repeatedNames = [...nameCounts].filter(([, count]) => count > 1);
	return [
		`distinct picks ${distinct(runs.map((run) => run.picked))}/${runs.length}`,
		`titles ${distinct(runs.map((run) => run.build?.title))}/${runs.length}`,
		`first lines ${distinct(runs.map((run) => firstLine(run.passages[0] ?? '')))}/${runs.length}`,

		repeatedNames.length > 0
			? `repeated names: ${repeatedNames.map(([name, count]) => `${name} ×${count}`).join(', ')}`
			: 'no repeated names'
	].join(' · ');
}

export function summary(runs: readonly BenchRun[]): string {
	const groups = new Map<string, BenchRun[]>();
	for (const run of runs) {
		const key = `${run.brief.id} · ${run.model}`;
		groups.set(key, [...(groups.get(key) ?? []), run]);
	}
	const lines = [
		'# Daydream bench',
		'',
		`${runs.length} runs, $${runs.reduce((sum, run) => sum + run.cost, 0).toFixed(4)} in all.`,
		'',
		'| Brief · model | Runs | Errors | Checks passed | Variety |',
		'| --- | --- | --- | --- | --- |'
	];
	for (const [key, group] of groups) {
		const checks = group.flatMap((run) => run.checks);
		const passed = checks.filter((check) => check.ok).length;
		const errors = group.filter((run) => run.error).length;
		lines.push(
			`| ${key} | ${group.length} | ${errors} | ${percent(passed, checks.length)} | ${variety(group)} |`
		);
	}
	lines.push('', '## Failed checks', '');
	for (const run of runs) {
		const failed = run.checks.filter((check) => !check.ok);
		if (failed.length > 0 || run.error) {
			lines.push(`### ${run.brief.id} · ${run.model} · ${run.seed}`);
			if (run.error) {
				lines.push(`- **error**: ${run.error}`);
			}
			lines.push(...failed.map((check) => `- ${check.id}: ${check.detail}`), '');
		}
	}
	return lines.join('\n');
}

/** One run in full, to read: every prompt as sent and every reply as received. */
export function runDocument(run: BenchRun): string {
	const lines = [
		`# ${run.brief.id} · ${run.model} · ${run.seed}`,
		'',
		`Brief: ${run.brief.brief}`,
		`Nudges: ${run.nudges.map((nudge) => `${nudge.dimension}: ${nudge.text}`).join('; ')}`,
		`Picked: ${run.picked ?? '(none)'}`,
		`Cost: $${run.cost.toFixed(4)}`,
		''
	];
	if (run.error) {
		lines.push(`**Error:** ${run.error}`, '');
	}
	for (const step of run.steps) {
		const { completion } = step;
		lines.push(
			`## ${step.step}`,
			'',
			`${completion.provider ?? 'unknown provider'} · ${completion.latencyMs} ms · ${completion.usage.promptTokens} in / ${completion.usage.completionTokens} out · finish: ${completion.finishReason ?? '?'}`,
			''
		);
		for (const message of step.messages) {
			lines.push(
				`<details><summary>${message.role}</summary>`,
				'',
				'```',
				message.content,
				'```',
				'',
				'</details>',
				''
			);
		}
		lines.push('### Reply', '', '```', completion.text, '```', '');
	}
	lines.push(
		'## Checks',
		'',
		...run.checks.map((check) => `- ${check.ok ? '✓' : '✗'} ${check.id}: ${check.detail}`)
	);
	return lines.join('\n');
}
