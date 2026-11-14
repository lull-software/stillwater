<script lang="ts">
	import Badge from '../components/Badge.svelte';
	import { app } from '../lib/app.svelte.ts';
	import { passphraseProblem } from '../lib/crypto.ts';
	import { timeAgo } from '../lib/format.ts';
	import { newTokenUrl, testToken } from '../lib/github.ts';
	import { fetchOverview, normaliseUrl } from '../lib/monitor.ts';
	import { exportVault } from '../lib/vault.ts';

	// ---- GitHub tokens
	let owner = $state('');
	let label = $state('');
	let token = $state('');
	let adding = $state(false);
	let tokenError = $state<string | null>(null);

	const reports = $derived(new Map((app.github?.tokens ?? []).map((t) => [t.id, t])));

	async function addToken(e: SubmitEvent) {
		e.preventDefault();
		adding = true;
		tokenError = null;
		try {
			const value = token.trim();
			const { login } = await testToken(value);
			const name = label.trim() || owner.trim() || login;
			await app.save({ ...app.data, github: [...app.data.github, { id: crypto.randomUUID(), label: name, token: value }] });
			owner = label = token = '';
			app.syncGithub();
		} catch (err) {
			tokenError = err instanceof Error ? err.message : String(err);
		} finally {
			adding = false;
		}
	}

	async function removeToken(id: string) {
		await app.save({ ...app.data, github: app.data.github.filter((t) => t.id !== id) });
		app.syncGithub();
	}

	async function setScope(key: 'includeForks' | 'includeArchived', value: boolean) {
		await app.save({ ...app.data, prefs: { ...app.data.prefs, [key]: value } });
		app.syncGithub();
	}

	// ---- Stillwater Monitor
	let swUrl = $state('');
	let swToken = $state('');
	let connecting = $state(false);
	let swError = $state<string | null>(null);

	const monitorState = (url: string) => app.monitors.find((m) => m.url === url);

	async function connect(e: SubmitEvent) {
		e.preventDefault();
		connecting = true;
		swError = null;
		try {
			const conn = { url: normaliseUrl(swUrl), token: swToken.trim() };
			if (app.data.monitors.some((m) => m.url === conn.url)) throw new Error('Already connected. Disconnect it first to change its token.');
			await fetchOverview(conn);
			await app.save({ ...app.data, monitors: [...app.data.monitors, conn] });
			swUrl = swToken = '';
			app.syncMonitor();
		} catch (err) {
			swError = err instanceof Error ? err.message : String(err);
		} finally {
			connecting = false;
		}
	}

	async function disconnect(url: string) {
		await app.save({ ...app.data, monitors: app.data.monitors.filter((m) => m.url !== url) });
		app.syncMonitor();
	}

	// ---- Security
	let next = $state('');
	let again = $state('');
	let changed = $state(false);
	let changing = $state(false);
	const nextProblem = $derived(next ? passphraseProblem(next) : null);

	async function change(e: SubmitEvent) {
		e.preventDefault();
		changing = true;
		await app.changePassphrase(next);
		changing = false;
		next = again = '';
		changed = true;
	}

	async function setAutoLock(minutes: number) {
		await app.save({ ...app.data, prefs: { ...app.data.prefs, autoLockMinutes: minutes } });
	}

	function backup() {
		const blob = new Blob([exportVault()], { type: 'application/json' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `stillwater-backup-${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		URL.revokeObjectURL(a.href);
	}

	function forget() {
		if (confirm('Delete your tokens, settings and cached data from this browser? Your GitHub data is untouched. This cannot be undone.')) app.forget();
	}
</script>

<div class="stack">
	<h1>Settings</h1>

	<section class="card">
		<div class="card-head"><h2>GitHub tokens</h2></div>
		<div class="card-body stack">
			<p class="muted">
				Read-only tokens, encrypted in this browser. A fine-grained token covers one owner (you, or one organisation), so add one for each
				owner whose repos you want to see. A classic token with <code>repo</code> covers everything at once, but it can also write; prefer
				fine-grained.
			</p>

			{#if app.data.github.length}
				<div class="scroll-x">
					<table class="list">
						<thead><tr><th>Name</th><th>Status</th><th class="num hide-sm">Repos</th><th class="hide-sm">Rate limit left</th><th></th></tr></thead>
						<tbody>
							{#each app.data.github as t (t.id)}
								{@const r = reports.get(t.id)}
								<tr>
									<td>{t.label}{#if r?.login}<div class="muted small">as {r.login}</div>{/if}</td>
									<td>
										{#if !r}<Badge size="sm" mark="unknown" label="Not checked yet" />
										{:else if r.ok}<Badge size="sm" mark="good" label="Working" />
										{:else}<Badge size="sm" mark="serious" label="Failing" /><div class="muted small">{r.error}</div>{/if}
									</td>
									<td class="num hide-sm">{r?.repos ?? '—'}</td>
									<td class="hide-sm muted small">{r?.rateRemaining !== undefined ? `${r.rateRemaining} points` : '—'}</td>
									<td class="right"><button class="danger" onclick={() => removeToken(t.id)}>Remove</button></td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}

			<form class="fields" onsubmit={addToken}>
				<label>
					<span>1. Make a token on GitHub</span>
					<div class="row wrap">
						<input bind:value={owner} placeholder="Owner, e.g. your username or an organisation" class="grow" aria-label="Owner" />
						<a class="button" href={newTokenUrl(owner.trim() || undefined)} target="_blank" rel="noreferrer">Open GitHub ↗</a>
					</div>
					<small class="muted">
						Opens GitHub's form with read-only access to contents, issues, pull requests, commit statuses, checks and Dependabot alerts
						filled in. Pick "All repositories" (or the ones you want), check the permissions, then Generate.
					</small>
				</label>
				<label>
					<span>2. Paste it here</span>
					<input type="password" bind:value={token} placeholder="github_pat_…" autocomplete="off" spellcheck="false" class="mono" required />
				</label>
				<label>
					<span>Name <span class="muted">(optional)</span></span>
					<input bind:value={label} placeholder="Defaults to the owner" />
				</label>
				<div class="row">
					<button class="primary" disabled={adding || !token.trim()}>{adding ? 'Checking with GitHub…' : 'Check and save'}</button>
				</div>
				{#if tokenError}<p class="error-text small" role="alert">{tokenError}</p>{/if}
			</form>
		</div>
	</section>

	<section class="card">
		<div class="card-head"><h2>Which repos</h2></div>
		<div class="card-body fields">
			<p class="muted">Stillwater shows every repo your tokens can see. Forks and archived repos stay out unless you tick them here. To leave out a single repo, hide it on the Repos page.</p>
			<label class="check">
				<input type="checkbox" checked={app.data.prefs.includeForks} onchange={(e) => setScope('includeForks', e.currentTarget.checked)} />
				<span>Include forks</span>
			</label>
			<label class="check">
				<input type="checkbox" checked={app.data.prefs.includeArchived} onchange={(e) => setScope('includeArchived', e.currentTarget.checked)} />
				<span>Include archived repos</span>
			</label>
		</div>
	</section>

	<section class="card">
		<div class="card-head">
			<h2>Stillwater Monitor <span class="muted small">optional</span></h2>
		</div>
		<div class="card-body stack">
			<p class="muted">
				If you run <a href="https://github.com/lull-software/stillwater-monitor" target="_blank" rel="noreferrer">Stillwater Monitor</a> (self-hosted
				uptime and error monitoring on Cloudflare), connect it to see outages and errors next to your PRs. Connect as many as you run. For
				each, make a read-only token in its Settings › API tokens, and add <code>{location.origin}</code> to <code>ALLOWED_ORIGINS</code> in its
				<code>wrangler.jsonc</code>.
			</p>
			{#if app.data.monitors.length}
				<div class="scroll-x">
					<table class="list">
						<thead><tr><th>Monitor</th><th>Status</th><th class="num hide-sm">Projects</th><th></th></tr></thead>
						<tbody>
							{#each app.data.monitors as m (m.url)}
								{@const st = monitorState(m.url)}
								<tr>
									<td><a href={m.url} target="_blank" rel="noreferrer">{new URL(m.url).host}</a></td>
									<td>
										{#if st?.error}<Badge size="sm" mark="serious" label="Can't reach it" /><div class="muted small">{st.error}</div>
										{:else if st?.overview}<Badge size="sm" mark="good" label="Connected · {timeAgo(st.overview.generatedAt, app.now)}" />
										{:else}<Badge size="sm" mark="unknown" label="Not read yet" />{/if}
									</td>
									<td class="num hide-sm">{st?.overview?.projects.length ?? '—'}</td>
									<td class="right"><button class="danger" onclick={() => disconnect(m.url)}>Disconnect</button></td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
			<form class="fields" onsubmit={connect}>
				<label>
					<span>{app.data.monitors.length ? 'Add another monitor' : 'Stillwater Monitor address'}</span>
					<input bind:value={swUrl} placeholder="https://monitor.example.com" required />
				</label>
				<label>
					<span>API token</span>
					<input type="password" bind:value={swToken} placeholder="swm_…" autocomplete="off" spellcheck="false" class="mono" required />
				</label>
				<div class="row"><button class="primary" disabled={connecting}>{connecting ? 'Connecting…' : 'Connect'}</button></div>
				{#if swError}<p class="error-text small" role="alert">{swError}</p>{/if}
			</form>
		</div>
	</section>

	<section class="card">
		<div class="card-head"><h2>Lock and backup</h2></div>
		<div class="card-body stack">
			<label class="fields">
				<span class="strong">Lock after</span>
				<select value={String(app.data.prefs.autoLockMinutes)} onchange={(e) => setAutoLock(Number(e.currentTarget.value))}>
					<option value="5">5 minutes without use</option>
					<option value="15">15 minutes without use</option>
					<option value="30">30 minutes without use</option>
					<option value="60">1 hour without use</option>
					<option value="0">Only when I lock it or close the tab</option>
				</select>
			</label>

			<form class="fields" onsubmit={change}>
				<span class="strong">Change passphrase</span>
				<input type="password" bind:value={next} placeholder="New passphrase or code" autocomplete="new-password" aria-label="New passphrase" />
				<input type="password" bind:value={again} placeholder="Same again" autocomplete="new-password" aria-label="New passphrase again" />
				{#if nextProblem}<small class="muted">{nextProblem}</small>{/if}
				<div class="row">
					<button disabled={!next || !!nextProblem || next !== again || changing}>{changing ? 'Changing…' : 'Change'}</button>
					{#if changed}<span class="muted small" role="status">Changed. Use the new one from now on.</span>{/if}
				</div>
			</form>

			<div class="fields">
				<span class="strong">Move to another browser</span>
				<p class="muted small">
					Download a backup and restore it on the other browser's lock screen. It stays encrypted: it opens with this passphrase only.
				</p>
				<div class="row"><button onclick={backup}>Download backup</button></div>
			</div>

			<div class="fields">
				<span class="strong">Forget everything</span>
				<p class="muted small">Deletes your tokens, settings and cached data from this browser.</p>
				<div class="row"><button class="danger" onclick={forget}>Forget everything</button></div>
			</div>
		</div>
	</section>

	<section class="card">
		<div class="card-head"><h2>Where your data is</h2></div>
		<div class="card-body">
			<ul class="facts muted">
				<li>Your tokens and settings: in this browser's storage, encrypted with AES-256-GCM. The key comes from your passphrase (PBKDF2, 600,000 rounds) and is kept in memory only while unlocked.</li>
				<li>Your GitHub tokens are sent to <code>api.github.com</code> and nowhere else. The page's security policy blocks any other destination, so the browser enforces this, not only the code.</li>
				<li>Each Stillwater Monitor token is sent only to the monitor address you entered it with.</li>
				<li>Stillwater has no server, no account, no analytics and no cookies.</li>
			</ul>
		</div>
	</section>
</div>

<style>
	.wrap {
		flex-wrap: wrap;
	}

	.right {
		text-align: right;
	}

	.strong {
		font-weight: 500;
	}

	.fields {
		max-width: 640px;
	}

	.facts {
		margin: 0;
		padding-left: 18px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	h2 .small {
		font-weight: 400;
		margin-left: 6px;
	}
</style>
