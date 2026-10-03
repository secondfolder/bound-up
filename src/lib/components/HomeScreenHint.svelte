<script lang="ts">
	import {
		HOME_SCREEN_HINT_DISMISSED_KEY,
		isStandalone,
		shouldOfferHomeScreen
	} from '$lib/home-screen';
	import DismissibleHint from './DismissibleHint.svelte';
	import ShareGlyph from './ShareGlyph.svelte';

	/**
	 * "Add to Home Screen to stay signed in for longer", on iPhone and iPad only.
	 *
	 * Safari clears a site's storage after a week without a visit, and that is
	 * what signs an iPhone user out; the Home Screen app is exempt. The web
	 * cannot add itself there, so this can only say how. See `home-screen.ts`.
	 */
</script>

<DismissibleHint
	dismissedKey={HOME_SCREEN_HINT_DISMISSED_KEY}
	testid="home-screen-hint"
	title="Add to Home Screen to stay signed in for longer"
	shouldShow={() =>
		shouldOfferHomeScreen({
			userAgent: navigator.userAgent,
			maxTouchPoints: navigator.maxTouchPoints,
			standalone: isStandalone()
		})}
>
	Tap <ShareGlyph />, then “Add to Home Screen”.
</DismissibleHint>
