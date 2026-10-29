/**
 * The leaderboard of prompt versions from blind A/B votes (docs/dreams.md,
 * "Quality tools"): a Bradley–Terry fit, the standard way to turn pairwise
 * wins into one strength per version. A tie counts half a win to each.
 *
 * Alias-free, for the bench.
 */

export type Vote = {
	/** The prompt versions on each side, by bench label. */
	a: string;
	b: string;
	winner: 'a' | 'b' | 'tie';
};

export type Standing = {
	label: string;
	strength: number;
	wins: number;
	losses: number;
	ties: number;
};

const ITERATIONS = 200;

/** Strengths scaled so the versions' geometric mean is 1; higher is better. */
export function bradleyTerry(votes: readonly Vote[]): Standing[] {
	const labels = [...new Set(votes.flatMap((vote) => [vote.a, vote.b]))];
	const wins = new Map<string, number>(labels.map((label) => [label, 0]));
	const games = new Map<string, number>();
	const record = new Map<string, Standing>(
		labels.map((label) => [label, { label, strength: 1, wins: 0, losses: 0, ties: 0 }])
	);
	const pairKey = (x: string, y: string): string => (x < y ? `${x}\u0000${y}` : `${y}\u0000${x}`);
	for (const vote of votes) {
		if (vote.a === vote.b) {
			continue;
		}
		games.set(pairKey(vote.a, vote.b), (games.get(pairKey(vote.a, vote.b)) ?? 0) + 1);
		const a = record.get(vote.a);
		const b = record.get(vote.b);
		if (!(a && b)) {
			continue;
		}
		if (vote.winner === 'tie') {
			wins.set(vote.a, (wins.get(vote.a) ?? 0) + 0.5);
			wins.set(vote.b, (wins.get(vote.b) ?? 0) + 0.5);
			a.ties += 1;
			b.ties += 1;
		} else {
			const [winner, loser] = vote.winner === 'a' ? [a, b] : [b, a];
			wins.set(winner.label, (wins.get(winner.label) ?? 0) + 1);
			winner.wins += 1;
			loser.losses += 1;
		}
	}
	let strength = new Map<string, number>(labels.map((label) => [label, 1]));
	for (let step = 0; step < ITERATIONS; step += 1) {
		const next = new Map<string, number>();
		for (const label of labels) {
			let denominator = 0;
			for (const other of labels) {
				const played = other === label ? 0 : (games.get(pairKey(label, other)) ?? 0);
				if (played > 0) {
					denominator += played / ((strength.get(label) ?? 1) + (strength.get(other) ?? 1));
				}
			}
			// A small floor keeps a version that never won from collapsing to zero.
			next.set(label, denominator > 0 ? Math.max((wins.get(label) ?? 0) / denominator, 1e-6) : 1);
		}
		const logMean =
			labels.reduce((sum, label) => sum + Math.log(next.get(label) ?? 1), 0) / labels.length;
		strength = new Map(labels.map((label) => [label, (next.get(label) ?? 1) / Math.exp(logMean)]));
	}
	return labels
		.map((label) => ({ ...(record.get(label) as Standing), strength: strength.get(label) ?? 1 }))
		.sort((x, y) => y.strength - x.strength);
}
