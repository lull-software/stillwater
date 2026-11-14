<script lang="ts">
	import Badge from '../components/Badge.svelte';
	import ItemTitle from '../components/ItemTitle.svelte';
	import { app } from '../lib/app.svelte.ts';
	import { problems, reasonLabel, tasks, type Task } from '../lib/attention.ts';
	import { plural, timeAgo } from '../lib/format.ts';
	import { healthLabel, type Mark } from '../lib/marks.ts';

	const problemList = $derived(
		problems({ snapshot: app.github, repos: app.repos, pulls: app.pulls, me: app.me, monitors: app.monitors })
	);
	const taskList = $derived(tasks({ snapshot: app.github, pulls: app.pulls, issues: app.issues, me: app.me }));
	const failingCi = $derived(app.repos.filter((r) => !r.isArchived && (r.ci.state === 'FAILURE' || r.ci.state === 'ERROR')).length);
	const projects = $derived(app.monitorProjects);
	const projectsDown = $derived(projects.filter((p) => p.health === 'critical').length);
	const monitorLink = $derived(app.monitors.length === 1 ? app.monitors[0].url : '#/settings');

	const reasonMark: Record<Task['reason'], Mark> = { review: 'info', changes: 'warning', ready: 'good', assigned: 'info', failing: 'serious' };

	function projectCounts(repos: string[]) {
		const names = new Set(repos.map((r) => r.toLowerCase()));
		return {
			pulls: app.pulls.filter((p) => names.has(p.repo.toLowerCase())).length,
			issues: app.issues.filter((i) => names.has(i.repo.toLowerCase())).length
		};
	}
</script>

<div class="stack">
	<div class="page-head">
		<h1>Overview</h1>
		{#if app.github?.viewer}
			<span class="muted small">
				<img class="avatar" src={app.github.viewer.avatarUrl} alt="" />
				{app.github.viewer.login} · {plural(app.repos.length, 'repo')}
			</span>
		{/if}
	</div>

	{#if app.data.github.length === 0}
		<section class="card welcome">
			<h2>Add a GitHub token to begin</h2>
			<p class="muted">
				Stillwater reads your repos with a read-only token that stays encrypted in this browser. Fine-grained tokens cover one owner each,
				so add one per organisation you work in.
			</p>
			<div><a class="button" href="#/settings">Add a token</a></div>
		</section>
	{:else if !app.github}
		<section class="card"><div class="empty">{app.syncing ? 'Fetching your repos from GitHub…' : 'Nothing fetched yet.'}</div></section>
	{:else}
		<div class="tiles">
			<a class="card tile" href="#/pulls?filter=review"><span class="n">{taskList.length}</span><span class="muted">Waiting on you</span></a>
			<a class="card tile" href="#/pulls"><span class="n">{app.pulls.length}</span><span class="muted">Open pull requests</span></a>
			<a class="card tile" href="#/issues"><span class="n">{app.issues.length}</span><span class="muted">Open issues</span></a>
			<a class="card tile" href="#/repos"><span class="n">{failingCi}</span><span class="muted">Failing builds</span></a>
			{#if projects.length}
				<a class="card tile" href={monitorLink} target={monitorLink.startsWith('#') ? undefined : '_blank'} rel="noreferrer">
					<span class="n">{projectsDown}</span><span class="muted">Projects down</span>
				</a>
			{/if}
		</div>

		<div class="columns">
			<section class="card">
				<div class="card-head"><h2>Needs attention</h2><span class="muted small">{problemList.length || ''}</span></div>
				{#if problemList.length}
					<ul class="items">
						{#each problemList as p (p.key)}
							<li>
								<Badge mark={p.severity} label={p.severity} quiet />
								<div class="grow">
									<a class="plain title" href={p.href} target={p.href.startsWith('#') ? undefined : '_blank'} rel="noreferrer">{p.title}</a>
									{#if p.detail}<div class="muted small truncate">{p.detail}</div>{/if}
								</div>
								<span class="muted small meta">{p.source}{p.since ? ` · ${timeAgo(p.since, app.now)}` : ''}</span>
							</li>
						{/each}
					</ul>
				{:else}
					<div class="empty">Nothing broken. Builds are green{projects.length ? ' and everything is up' : ''}.</div>
				{/if}
			</section>

			<section class="card">
				<div class="card-head"><h2>Waiting on you</h2><span class="muted small">{taskList.length || ''}</span></div>
				{#if taskList.length}
					<ul class="items">
						{#each taskList.slice(0, 25) as t (t.key)}
							<li>
								<Badge mark={reasonMark[t.reason]} label={reasonLabel[t.reason]} quiet />
								<div class="grow">
									<ItemTitle item={t.item} isPull={t.isPull} />
									<div class="muted small">{reasonLabel[t.reason]} · updated {timeAgo(t.item.updatedAt, app.now)}</div>
								</div>
							</li>
						{/each}
					</ul>
					{#if taskList.length > 25}<div class="more muted small">And {taskList.length - 25} more in Pull requests and Issues.</div>{/if}
				{:else}
					<div class="empty">No reviews asked of you and nothing assigned. Enjoy it.</div>
				{/if}
			</section>
		</div>
	{/if}

	{#if projects.length}
		<section class="card">
			<div class="card-head">
				<h2>Projects</h2>
				<span class="muted small">
					From {#each app.monitors as m, i (m.url)}{i > 0 ? ', ' : ''}<a class="plain" href={m.url} target="_blank" rel="noreferrer">{new URL(m.url).host}</a>{/each}
				</span>
			</div>
			<div class="scroll-x">
				<table class="list">
					<thead>
						<tr><th>Project</th><th>Status</th><th class="num hide-sm">Checks</th><th class="num hide-sm">Errors</th><th class="num">PRs</th><th class="num">Issues</th></tr>
					</thead>
					<tbody>
						{#each projects as p (p.href)}
							{@const c = projectCounts(p.repos)}
							<tr>
								<td><a href={p.href} target="_blank" rel="noreferrer">{p.name}</a></td>
								<td><Badge size="sm" mark={p.health} label={p.down ? `${p.down} down` : healthLabel[p.health]} /></td>
								<td class="num hide-sm">{p.checks}</td>
								<td class="num hide-sm">{p.openErrorGroups || '—'}</td>
								<td class="num">{c.pulls}</td>
								<td class="num">{c.issues}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}
</div>

<style>
	.welcome {
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		max-width: 640px;
	}

	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 12px;
	}

	.tile {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 14px 16px;
		text-decoration: none;
	}

	.tile:hover {
		border-color: var(--border-strong);
	}

	.n {
		font-size: 24px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.columns {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
		align-items: start;
	}

	.items {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.items li {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 10px 16px;
		border-bottom: 1px solid var(--border);
	}

	.items li:last-child {
		border-bottom: none;
	}

	.items :global(.badge) {
		margin-top: 3px;
	}

	.title {
		font-weight: 500;
	}

	.meta {
		flex: none;
		white-space: nowrap;
	}

	.more {
		padding: 10px 16px;
		border-top: 1px solid var(--border);
	}

	@media (max-width: 900px) {
		.columns {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 500px) {
		.tiles {
			grid-template-columns: 1fr 1fr;
		}
		.meta {
			display: none;
		}
	}
</style>
