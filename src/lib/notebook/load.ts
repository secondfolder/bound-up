import { browser } from '$app/environment';

/**
 * The notebook's live editing, loaded only in a browser.
 *
 * Yjs, `@lexical/yjs` and the session are browser-only, and nothing the
 * server renders needs them: an entry's page renders a placeholder until its
 * vault is open, which only happens in the browser. So they are reached
 * through `import()` behind `browser`, a build-time constant, which removes
 * the imports from the server build altogether, keeping them out of the
 * worker bundle (whose size the Workers plan caps). A plain `import()` would
 * not: the server build would still emit, and wrangler still bundle, its
 * target. The same arrangement as `src/lib/media/` (AGENTS.md invariant 13).
 */

function browserOnly(): never {
	throw new Error('The notebook editor loads only in a browser.');
}

/** The entry page's live pieces: the session, the editor and the history drawer. */
export const loadNotebookEditor = browser
	? async () => {
			const [session, editor, history, scenePrompts, sceneBlockBar] = await Promise.all([
				import('./session.svelte'),
				import('$lib/components/notebook/CollaborativeEditor.svelte'),
				import('$lib/components/notebook/VersionHistory.svelte'),
				// Lexical and the scene catalogue, for a scene's prompt column;
				// loaded with the editor, which needs Lexical anyway.
				import('$lib/components/scenes/ScenePrompts.svelte'),
				import('$lib/components/scenes/SceneBlockBar.svelte')
			]);
			return {
				NotebookSession: session.NotebookSession,
				CollaborativeEditor: editor.default,
				VersionHistory: history.default,
				ScenePrompts: scenePrompts.default,
				SceneBlockBar: sceneBlockBar.default
			};
		}
	: browserOnly;

/** The Yjs helpers alone, for starting a new entry from a list. */
export const loadCollab = browser ? () => import('./collab') : browserOnly;
