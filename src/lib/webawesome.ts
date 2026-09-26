/**
 * The Web Awesome elements this app uses, registered.
 *
 * Web Awesome is installed from npm rather than pulled off a CDN, so the
 * components are cherry-picked here instead of being autoloaded at runtime.
 * Anything new a page reaches for needs its import added below, otherwise the
 * custom element never registers and the markup renders as an inert unknown
 * tag.
 *
 * One list, imported by both the root layout and the component tests'
 * browser setup (`vitest-setup-browser.ts`), so a component that works in the
 * app has the same elements available in its tests. Two lists would drift, and
 * a test missing a registration silently falls back to that inert tag.
 */
import '@awesome.me/webawesome/dist/styles/webawesome.css';
import '@awesome.me/webawesome/dist/components/avatar/avatar.js';
import '@awesome.me/webawesome/dist/components/badge/badge.js';
import '@awesome.me/webawesome/dist/components/callout/callout.js';
import '@awesome.me/webawesome/dist/components/checkbox/checkbox.js';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/button-group/button-group.js';
import '@awesome.me/webawesome/dist/components/card/card.js';
import '@awesome.me/webawesome/dist/components/dialog/dialog.js';
import '@awesome.me/webawesome/dist/components/dropdown/dropdown.js';
import '@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js';
import '@awesome.me/webawesome/dist/components/icon/icon.js';
import '@awesome.me/webawesome/dist/components/input/input.js';
import '@awesome.me/webawesome/dist/components/divider/divider.js';
import '@awesome.me/webawesome/dist/components/skeleton/skeleton.js';
import '@awesome.me/webawesome/dist/components/spinner/spinner.js';
import '@awesome.me/webawesome/dist/components/textarea/textarea.js';
