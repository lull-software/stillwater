import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

/**
 * The security headers, written to dist/_headers, which Cloudflare serves with
 * every file. The one that matters most is connect-src: it is the list of
 * places this page can send anything to. Your GitHub tokens can only ever go
 * to api.github.com, whatever the code says, because the browser enforces it.
 *
 * MONITOR_ORIGINS adds the addresses Stillwater may fetch a Stillwater Monitor
 * overview from:
 *   unset    any https address (right for a public copy, where everyone's
 *            Stillwater Monitor lives somewhere else)
 *   ""       none: GitHub only
 *   "https://monitor.example.com"   just yours (space separated for more)
 * Whichever it is, the Stillwater Monitor token is only sent to the address you type
 * in Settings.
 */
function securityHeaders(): Plugin {
	const extra = process.env.MONITOR_ORIGINS ?? 'https:';
	const csp = [
		"default-src 'self'",
		"script-src 'self'",
		// Svelte sets style attributes at runtime.
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: https://avatars.githubusercontent.com",
		`connect-src 'self' https://api.github.com${extra.trim() ? ` ${extra.trim()}` : ''}`,
		"font-src 'self'",
		"object-src 'none'",
		"base-uri 'none'",
		"form-action 'none'",
		"frame-ancestors 'none'"
	].join('; ');
	const headers = [
		'/*',
		`  Content-Security-Policy: ${csp}`,
		'  X-Content-Type-Options: nosniff',
		'  Referrer-Policy: no-referrer',
		'  Cross-Origin-Opener-Policy: same-origin',
		'  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()',
		'  Strict-Transport-Security: max-age=31536000',
		''
	].join('\n');
	return {
		name: 'stillwater-security-headers',
		apply: 'build',
		generateBundle() {
			this.emitFile({ type: 'asset', fileName: '_headers', source: headers });
		}
	};
}

export default defineConfig({
	plugins: [svelte(), securityHeaders()],
	build: { target: 'es2023' }
});
