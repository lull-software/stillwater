<script lang="ts">
	import ItemTitle from '../components/ItemTitle.svelte';
	import { app } from '../lib/app.svelte.ts';
	import { timeAgo } from '../lib/format.ts';
	import { hashParam, matches } from '../lib/query.ts';

	type Filter = 'all' | 'assigned' | 'created' | 'unassigned';
	const initial = hashParam('filter') as Filter | null;
	let filter = $state<Filter>(initial && ['assigned', 'created', 'unassigned'].includes(initial) ? initial : 'all');
	let repo = $state('');
	let q = $state('');
	let sort = $state<'updated' | 'stale' | 'new' | 'discussed'>('updated');

	const assigned = $derived(new Set(app.github?.assigned ?? []));
	const repoNames = $derived([...new Set(app.issues.map((i) => i.repo))].sort((a, b) => a.localeCompare(b)));

	const list = $derived(
		app.issues
			.filter((i) =>
				filter === 'assigned'
					? assigned.has(i.url) || (!!app.me && i.assignees.includes(app.me))
					: filter === 'created'
						? i.author === app.me
						: filter === 'unassigned'
							? i.assignees.length === 0
							: true
			)
			.filter((i) => !repo || i.repo === repo)
			.filter((i) => matches(`${i.title} ${i.repo} #${i.number} ${i.author ?? ''} ${i.labels.map((l) => l.name).join(' ')}`, q))
			.toSorted((a, b) =>
				sort === 'new'
					? Date.parse(b.createdAt) - Date.parse(a.createdAt)
					: sort === 'stale'
						? Date.parse(a.updatedAt) - Date.parse(b.updatedAt)
						: sort === 'discussed'
							? b.comments - a.comments
							: Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
			)
	);
</script>

<div class="stack">
	<div class="page-head">
		<h1>Issues</h1>
		<span class="muted small">{list.length} of {app.issues.length} open</span>
	</div>

	<section class="card">
		<div class="toolbar">
			<div class="chips" role="group" aria-label="Show">
				<button class="chip" aria-pressed={filter === 'all'} onclick={() => (filter = 'all')}>All</button>
				<button class="chip" aria-pressed={filter === 'assigned'} onclick={() => (filter = 'assigned')}>Assigned to me</button>
				<button class="chip" aria-pressed={filter === 'created'} onclick={() => (filter = 'created')}>Opened by me</button>
				<button class="chip" aria-pressed={filter === 'unassigned'} onclick={() => (filter = 'unassigned')}>Unassigned</button>
			</div>
			<input type="search" placeholder="Filter by title, repo, author, label" bind:value={q} aria-label="Filter" />
			<select bind:value={repo} aria-label="Repository">
				<option value="">All repos</option>
				{#each repoNames as name (name)}<option value={name}>{name}</option>{/each}
			</select>
			<select bind:value={sort} aria-label="Sort">
				<option value="updated">Recently updated</option>
				<option value="new">Newest</option>
				<option value="discussed">Most discussed</option>
				<option value="stale">Least recently updated</option>
			</select>
		</div>

		{#if list.length}
			<div class="scroll-x">
				<table class="list">
					<thead><tr><th>Issue</th><th class="hide-sm">Assignees</th><th class="num hide-sm">Comments</th><th>Updated</th></tr></thead>
					<tbody>
						{#each list as i (i.url)}
							<tr>
								<td class="main"><ItemTitle item={i} isPull={false} labels /></td>
								<td class="hide-sm small">{i.assignees.length ? i.assignees.join(', ') : '—'}</td>
								<td class="num hide-sm">{i.comments || '—'}</td>
								<td class="muted small nowrap">{timeAgo(i.updatedAt, app.now)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<div class="empty">{app.issues.length ? 'No issues match.' : app.github ? 'No open issues anywhere.' : 'Add a GitHub token in Settings.'}</div>
		{/if}
		{#if app.github?.truncated.length}
			<p class="muted small note">Showing the 50 most recently updated per repo for {app.github.truncated.join(', ')}.</p>
		{/if}
	</section>
</div>

<style>
	.main {
		min-width: 260px;
	}

	.nowrap {
		white-space: nowrap;
	}

	.note {
		padding: 10px 16px;
		border-top: 1px solid var(--border);
	}

	@media (max-width: 700px) {
		.main {
			min-width: 200px;
		}
	}
</style>
