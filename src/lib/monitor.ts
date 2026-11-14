/**
 * An optional connection to your own Stillwater Monitor (self-hosted monitoring for
 * Cloudflare Workers): uptime, heartbeats and errors, per project. Read from
 * its GET /api/overview with a read-only token made in Stillwater Monitor's Settings.
 */

export type Health = 'good' | 'warning' | 'serious' | 'critical' | 'unknown';

export type MonitorItem = {
	kind: 'monitor' | 'heartbeat' | 'traffic' | 'error' | 'ci' | 'dependabot' | 'job';
	health: 'warning' | 'serious' | 'critical';
	projectId: string | null;
	title: string;
	detail?: string;
	href: string;
	since?: number;
};

export type MonitorProject = {
	id: string;
	name: string;
	url: string | null;
	href: string;
	health: Health;
	repos: string[];
	checks: number;
	down: number;
	openErrorGroups: number;
};

export type MonitorOverview = {
	version: 1;
	monitor: string;
	generatedAt: number;
	projects: MonitorProject[];
	attention: MonitorItem[];
};

export type MonitorConnection = { url: string; token: string };

/** `https://monitor.example.com/anything` → `https://monitor.example.com`. */
export function normaliseUrl(input: string): string {
	const url = new URL(input.trim().includes('://') ? input.trim() : `https://${input.trim()}`);
	if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
		throw new Error('Use an https:// address.');
	}
	return url.origin;
}

export async function fetchOverview(conn: MonitorConnection): Promise<MonitorOverview> {
	let res: Response;
	try {
		res = await fetch(`${conn.url}/api/overview`, {
			headers: { authorization: `Bearer ${conn.token}` },
			credentials: 'omit',
			referrerPolicy: 'no-referrer',
			cache: 'no-store'
		});
	} catch {
		// A CORS refusal looks exactly like a network failure from here.
		throw new Error(
			`Could not reach ${conn.url}. Check the address, and that ALLOWED_ORIGINS in Stillwater Monitor's wrangler.jsonc includes ${location.origin}.`
		);
	}
	if (res.status === 401) throw new Error('Stillwater Monitor rejected the token. Make a new one in its Settings › API tokens.');
	if (res.status === 403) throw new Error(`Stillwater Monitor does not allow ${location.origin}. Add it to ALLOWED_ORIGINS.`);
	if (res.status === 404) throw new Error('No /api/overview there. Is this a Stillwater Monitor address, and is it up to date?');
	if (!res.ok) throw new Error(`Stillwater Monitor answered HTTP ${res.status}.`);
	const body = (await res.json()) as MonitorOverview;
	if (body.version !== 1) throw new Error('This Stillwater Monitor speaks a newer API version. Update Stillwater.');
	return body;
}
