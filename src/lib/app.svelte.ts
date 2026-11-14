import { fetchSnapshot, inScope, type Snapshot } from './github.ts';
import { fetchOverview, type MonitorOverview } from './monitor.ts';

/** One connected Stillwater Monitor: its last overview, or why it couldn't be read. */
export type MonitorState = { url: string; overview: MonitorOverview | null; error: string | null };
import * as vault from './vault.ts';
import type { VaultData } from './vault.ts';

/**
 * The app's one piece of state. The encryption key lives only here, in
 * memory: locking (or reloading the tab) drops it, and with it every token
 * and every bit of fetched data.
 */

const GITHUB_EVERY = 5 * 60_000;
const MONITOR_EVERY = 60_000;

export type Route = 'overview' | 'pulls' | 'issues' | 'repos' | 'settings';
const ROUTES: Route[] = ['overview', 'pulls', 'issues', 'repos', 'settings'];

function routeFromHash(): Route {
	const name = location.hash.replace(/^#\/?/, '').split('?')[0];
	return (ROUTES as string[]).includes(name) ? (name as Route) : 'overview';
}

class App {
	phase = $state<'new' | 'locked' | 'unlocked'>(vault.hasVault() ? 'locked' : 'new');
	route = $state<Route>(routeFromHash());
	data = $state<VaultData>(vault.emptyData());
	github = $state<Snapshot | null>(null);
	monitors = $state<MonitorState[]>([]);
	syncing = $state(false);
	syncError = $state<string | null>(null);
	now = $state(Date.now());

	#key: CryptoKey | null = null;
	#timers: ReturnType<typeof setInterval>[] = [];
	#idleSince = Date.now();

	constructor() {
		addEventListener('hashchange', () => (this.route = routeFromHash()));
		for (const type of ['pointerdown', 'keydown', 'scroll']) addEventListener(type, () => (this.#idleSince = Date.now()), { passive: true });
		// Another tab locked, unlocked or changed the vault: this tab's copy is stale.
		addEventListener('storage', (e) => {
			if (e.key === null || e.key === 'stillwater.vault') {
				this.lock();
				this.phase = vault.hasVault() ? 'locked' : 'new';
			}
		});
	}

	get me() {
		return this.github?.viewer?.login ?? null;
	}

	/** Repos in scope (forks and archived per Settings), minus hidden ones. */
	get repos() {
		const prefs = this.data.prefs;
		return (this.github?.repos ?? []).filter((r) => inScope(r, prefs) && !prefs.hidden.includes(r.name));
	}

	get pulls() {
		const names = new Set(this.repos.map((r) => r.name));
		return (this.github?.pulls ?? []).filter((p) => names.has(p.repo));
	}

	get issues() {
		const names = new Set(this.repos.map((r) => r.name));
		return (this.github?.issues ?? []).filter((i) => names.has(i.repo));
	}

	/** Every project from every connected monitor. */
	get monitorProjects() {
		return this.monitors.flatMap((m) => m.overview?.projects ?? []);
	}

	/** Stillwater Monitor project for a repo, when connected. */
	projectFor(repo: string) {
		return this.monitorProjects.find((p) => p.repos.some((r) => r.toLowerCase() === repo.toLowerCase())) ?? null;
	}

	async create(passphrase: string) {
		const { key, data } = await vault.createVault(passphrase);
		this.#start(key, data, null);
		location.hash = '#/settings';
	}

	async unlock(passphrase: string) {
		const opened = await vault.unlockVault(passphrase);
		if (!opened) return false;
		this.#start(opened.key, opened.data, await vault.loadCache(opened.key));
		return true;
	}

	lock() {
		this.#key = null;
		for (const t of this.#timers) clearInterval(t);
		this.#timers = [];
		this.data = vault.emptyData();
		this.github = null;
		this.monitors = [];
		this.syncError = null;
		if (this.phase === 'unlocked') this.phase = 'locked';
	}

	#start(key: CryptoKey, data: VaultData, cache: vault.Cache | null) {
		this.#key = key;
		this.data = data;
		this.github = cache?.github ?? null;
		this.monitors = data.monitors.map((m) => ({ url: m.url, overview: cache?.monitors?.[m.url] ?? null, error: null }));
		this.phase = 'unlocked';
		this.#idleSince = Date.now();
		this.sync();
		const visible = () => document.visibilityState === 'visible';
		this.#timers.push(
			setInterval(() => {
				this.now = Date.now();
				const minutes = this.data.prefs.autoLockMinutes;
				if (minutes > 0 && Date.now() - this.#idleSince > minutes * 60_000) this.lock();
			}, 15_000),
			setInterval(() => visible() && this.syncGithub(), GITHUB_EVERY),
			setInterval(() => visible() && this.syncMonitor(), MONITOR_EVERY)
		);
	}

	/** Saves tokens and preferences, encrypted. */
	async save(next: VaultData) {
		if (!this.#key) throw new Error('Locked');
		await vault.saveVault(this.#key, $state.snapshot(next) as VaultData);
		this.data = next;
	}

	async changePassphrase(passphrase: string) {
		if (!this.#key) throw new Error('Locked');
		this.#key = await vault.changePassphrase(this.#key, $state.snapshot(this.data) as VaultData, passphrase);
	}

	async #saveCache() {
		if (!this.#key) return;
		await vault.saveCache(this.#key, { github: $state.snapshot(this.github), monitors: Object.fromEntries(this.monitors.flatMap((m) => (m.overview ? [[m.url, $state.snapshot(m.overview)]] : []))) } as vault.Cache);
	}

	async sync() {
		await Promise.all([this.syncGithub(), this.syncMonitor()]);
	}

	async syncGithub() {
		if (!this.#key || this.syncing) return;
		if (this.data.github.length === 0) {
			this.github = null;
			return;
		}
		this.syncing = true;
		this.syncError = null;
		try {
			const snapshot = await fetchSnapshot($state.snapshot(this.data.github), $state.snapshot(this.data.prefs));
			if (!this.#key) return; // locked while fetching
			this.github = snapshot;
			await this.#saveCache();
		} catch (err) {
			this.syncError = err instanceof Error ? err.message : String(err);
		} finally {
			this.syncing = false;
			this.now = Date.now();
		}
	}

	/** Reads every connected monitor at once. One that fails keeps its last overview. */
	async syncMonitor() {
		if (!this.#key) return;
		const conns = $state.snapshot(this.data.monitors);
		const previous = new Map(this.monitors.map((m) => [m.url, m.overview]));
		const results = await Promise.allSettled(conns.map((c) => fetchOverview(c)));
		if (!this.#key) return; // locked while fetching
		this.monitors = conns.map((c, i) => {
			const r = results[i];
			return r.status === 'fulfilled'
				? { url: c.url, overview: r.value, error: null }
				: { url: c.url, overview: previous.get(c.url) ?? null, error: r.reason instanceof Error ? r.reason.message : String(r.reason) };
		});
		await this.#saveCache();
	}

	forget() {
		this.lock();
		vault.forgetEverything();
		this.phase = 'new';
	}

	importBackup(text: string) {
		vault.importVault(text);
		this.lock();
		this.phase = 'locked';
	}
}

export const app = new App();
