<script lang="ts">
	import { resolve } from '$app/paths';
	import { NOTIFICATIONS_HINT_DISMISSED_KEY } from '$lib/notifications';
	import { shouldSuggestPush } from '$lib/push-client';
	import DismissibleHint from './DismissibleHint.svelte';

	/**
	 * "Turn on notifications", once the app is on the Home Screen.
	 *
	 * The follow-on to `HomeScreenHint`: adding the app is what makes push
	 * possible on an iPhone, so this is the moment to mention it. Rendered only
	 * when the server has push keys (the shell checks `pushAvailable`), and only
	 * to someone who has not decided yet — see `shouldSuggestPush`.
	 *
	 * A link rather than a switch, because the permission prompt has to come
	 * from a tap on the settings screen's own button (see `enablePush`), and the
	 * person should see what they are agreeing to before they do.
	 */
</script>

<DismissibleHint
	dismissedKey={NOTIFICATIONS_HINT_DISMISSED_KEY}
	testid="notifications-hint"
	title="Get notified about new messages"
	shouldShow={shouldSuggestPush}
>
	Hear when your partner messages you, even with Bound Up closed.
	<a href={resolve('/(auth-required)/(app)/settings/notifications')}>Turn on notifications</a>
</DismissibleHint>
