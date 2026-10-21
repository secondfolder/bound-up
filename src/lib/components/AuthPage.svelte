<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';

	/**
	 * The page around the log-in, sign-up and account-recovery screens, and
	 * the invite and confirmation pages that hang off them: a way back to the
	 * landing page, a centred title, and one column for everything under it.
	 *
	 * One component because they were built five ways — a bordered 300px box
	 * under a big centred title on two of them, a 26rem column under a small
	 * left-aligned title on two more, 30rem on the invite page — and moving
	 * between them (log in → forgot password → back) made the page lurch. The
	 * column is the AuthBox's width, so a page whose content is in a box and one
	 * whose content is not still share both edges.
	 */
	let {
		title,
		/** Wider, for the invite page's accept form. */
		wide = false,
		children
	}: { title: string; wide?: boolean; children: Snippet } = $props();
</script>

<div class="auth-page" class:wide={wide}>
	<!-- The landing page has the only other way here, so without this the
	     browser's back button was the one way out of log in and sign up. -->
	<a class="home" href={resolve('/')}>
		<wa-icon name="chevron-left" variant="solid" aria-hidden="true"></wa-icon>
		Back to Bound Up
	</a>
	<h1>{title}</h1>
	{@render children()}
</div>

<style>
	.auth-page {
		box-sizing: border-box;
		inline-size: 100%;
		max-inline-size: 22rem;
		margin-inline: auto;
		/* A little way down a tall window rather than pinned to its top edge,
		   where a short form left two thirds of the screen empty under it. */
		padding-block: clamp(0rem, 8svh - 2rem, 4rem) var(--wa-space-xl);
		display: flex;
		flex-direction: column;
		gap: 1rem;

		&.wide {
			max-inline-size: 30rem;
		}

		h1 {
			margin: 0 0 0.5rem;
			text-align: center;
		}
	}

	.home {
		align-self: center;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		/* The tint, not the amber: this sits on the brightest part of the wash,
		   where the amber measures about 4:1. */
		color: var(--accent-tint);
		font-size: var(--wa-font-size-s);
		font-weight: 700;

		wa-icon {
			font-size: 0.75em;
		}

		&:hover {
			color: var(--wa-color-text-normal);
		}
	}
</style>
