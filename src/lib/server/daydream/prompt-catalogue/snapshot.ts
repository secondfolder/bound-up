import { AXIS_PARAM, type Catalogue, type Combo } from '$lib/prompt-review';
import { type Builder, type BuilderId, comboFrom } from './axes';

/**
 * The committed catalogue, for the debug page (docs/prompt-review.md, "The
 * debug page"). Read from the snapshot rather than worked out per request:
 * enumerating the replies takes seconds of CPU, which a Worker on the Free
 * plan does not have, and the snapshot test keeps it identical to what the
 * builders produce. Each builder's file is its own chunk, loaded when that
 * builder is opened, so none of it weighs on any other page.
 */
const files = import.meta.glob<Catalogue>('/prompt-catalogue/*/catalogue.json', {
	import: 'default'
});

export async function loadCatalogue(id: BuilderId): Promise<Catalogue | null> {
	const load = files[`/prompt-catalogue/${id}/catalogue.json`];
	return load ? await load() : null;
}

/** The combination a URL's query names, for a builder: anything absent at its baseline. */
export function comboFromQuery(builder: Builder, query: URLSearchParams): Combo {
	return comboFrom(
		builder,
		Object.fromEntries(builder.axes.map((axis) => [axis.id, query.get(`${AXIS_PARAM}${axis.id}`)]))
	);
}
