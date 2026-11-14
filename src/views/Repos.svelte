<script lang="ts">
	import Badge from '../components/Badge.svelte';
	import { app } from '../lib/app.svelte.ts';
	import { inScope } from '../lib/github.ts';
	import { timeAgo } from '../lib/format.ts';
	import { ciMark, healthLabel } from '../lib/marks.ts';
	import { matches } from '../lib/query.ts';

	let filter = $state<'busy' | 'all' | 'failing' | 'hidden'>('busy');
	let q = $state('');

	const hidden = $derived(app.data.prefs.hidden);
	const all = $derived((app.github?.repos ?? []).filter((r) => inScope(r, app.data.prefs)));

	const list = $derived(
		all
			.filter((r) =>
				filter === 'hidden'
					? hidden.includes(r.name)
					: hidden.includes(r.name)
						? false
						: filter === 'failing'
							? r.ci.state === 'FAILURE' || r.ci.state === 'ERROR'
							: filter === 'busy'
								? r.openPulls + r.openIssues > 0 || !!r.dependabot || r.ci.state === 'FAILURE' || r.ci.state === 'ERROR'
								: true
			)
			.filter((r) => matches(r.name, q))
	);

	async function toggleHidden(name: string) {
		const prefs = app.data.prefs;
		const next = prefs.hidden.includes(name) ? prefs.hidden.filter((h) => h !== name) : [...prefs.hidden, name];
		await app.save({ ...app.data, prefs: { ...prefs, hidden: next } });
		// Newly shown repos need their PRs and issues fetched.
		if (!next.includes(name)) app.syncGithub();
	}
</script>

<div class="stack">
	<div class="page-head">
		<h1>Repos</h1>
		<span class="muted small">{all.length - hidden.length} shown · {hidden.length} hidden</span>
	</div>

	<section class="card">
		<div class="toolbar">
			<div class="chips" role="group" aria-label="Show">
				<button class="chip" aria-pressed={filter === 'busy'} onclick={() => (filter = 'busy')}>With open work</button>
				<button class="chip" aria-pressed={filter === 'failing'} onclick={() => (filter = 'failing')}>Failing CI</button>
				<button class="chip" aria-pressed={filter === 'all'} onclick={() => (filter = 'all')}>All</button>
				<button class="chip" aria-pressed={filter === 'hidden'} onclick={() => (filter = 'hidden')}>Hidden</button>
			</div>
			<input type="search" placeholder="Filter repos" bind:value={q} aria-label="Filter repos" />
		</div>

		{#if list.length}
			<div class="scroll-x">
				<table class="list">
					<thead>
						<tr>
							<th>Repository</th>
							<th>CI</th>
							<th class="num">PRs</th>
							<th class="num">Issues</th>
							<th class="num hide-sm">Dependabot</th>
							<th class="hide-sm">Last push</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each list as r (r.name)}
							{@const ci = ciMark(r.ci.state)}
							{@const project = app.projectFor(r.name)}
							<tr>
								<td class="main">
									<a class="plain name" href={r.url} target="_blank" rel="noreferrer">{r.name}</a>
									<div class="tags">
										{#if r.isPrivate}<span class="tag">Private</span>{/if}
										{#if r.isFork}<span class="tag">Fork</span>{/if}
										{#if r.isArchived}<span class="tag">Archived</span>{/if}
										{#if project}
											<a class="plain" href={project.href} target="_blank" rel="noreferrer" title="Stillwater Monitor project">
												<Badge size="sm" mark={project.health} label="{project.name}: {healthLabel[project.health]}" />
											</a>
										{/if}
									</div>
								</td>
								<td>
									<a class="plain" href={r.ci.url ?? r.url} target="_blank" rel="noreferrer"><Badge size="sm" mark={ci.mark} label={ci.label} /></a>
									{#if r.ci.failing.length}<div class="muted small">{r.ci.failing.join(', ')}</div>{/if}
								</td>
								<td class="num"><a class="plain" href="{r.url}/pulls" target="_blank" rel="noreferrer">{r.openPulls}</a></td>
								<td class="num"><a class="plain" href="{r.url}/issues" target="_blank" rel="noreferrer">{r.openIssues}</a></td>
								<td class="num hide-sm">
									{#if r.dependabot === null}<span class="muted" title="This token can't read Dependabot alerts here">—</span>
									{:else if r.dependabot}<a class="plain" href="{r.url}/security/dependabot" target="_blank" rel="noreferrer"><Badge size="sm" mark="warning" label={String(r.dependabot)} /></a>
									{:else}0{/if}
								</td>
								<td class="hide-sm muted small">{timeAgo(r.pushedAt, app.now)}</td>
								<td><button class="small" onclick={() => toggleHidden(r.name)}>{hidden.includes(r.name) ? 'Show' : 'Hide'}</button></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<div class="empty">
				{#if !app.github}Add a GitHub token in Settings.
				{:else if filter === 'hidden'}No hidden repos. Hide the ones you don't want in your lists.
				{:else if filter === 'failing'}No failing builds.
				{:else}No repos match.{/if}
			</div>
		{/if}
	</section>
</div>

<style>
	.main {
		min-width: 220px;
	}

	.name {
		font-weight: 500;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		margin-top: 3px;
	}

	.tags:empty {
		display: none;
	}
</style>
