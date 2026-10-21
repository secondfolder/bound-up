<script lang="ts" module>
	type T = Record<string, unknown>;
</script>

<script lang="ts" generics="T extends Record<string, unknown>">
	import type { Attachment } from 'svelte/attachments';
	import { type FormPathLeaves, formFieldProxy, type SuperForm } from 'sveltekit-superforms';

	/**
	 * A superforms boolean as a `wa-checkbox`: InputField's counterpart for a
	 * yes or no. Checked, it posts the field as "on", which superforms and Zod
	 * read as true; unchecked, it posts nothing, which they read as false.
	 */
	let {
		superform,
		field,
		title
	}: {
		superform: SuperForm<T>;
		field: FormPathLeaves<T>;
		title: string;
	} = $props();

	// svelte-ignore state_referenced_locally
	// Captured once on purpose, as in InputField: the proxy is the live store.
	const { value } = formFieldProxy(superform, field);

	/**
	 * Follows the box with a listener on the element itself, for the reason
	 * SelectField gives, and reads `checked` from it rather than the event.
	 */
	const follow: Attachment<HTMLElement> = (element) => {
		const host = element as HTMLElement & { checked?: boolean };
		const sync = () => {
			if (host.isConnected) {
				// `as` because the proxy is typed to the field's own type.
				$value = Boolean(host.checked) as typeof $value;
			}
		};
		host.addEventListener('change', sync);
		return () => host.removeEventListener('change', sync);
	};
</script>

<wa-checkbox name={field} checked={Boolean($value)} {@attach follow}>{title}</wa-checkbox>
