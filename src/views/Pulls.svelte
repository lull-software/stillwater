<script lang="ts">
	import Badge from '../components/Badge.svelte';
	import ItemTitle from '../components/ItemTitle.svelte';
	import { app } from '../lib/app.svelte.ts';
	import { timeAgo } from '../lib/format.ts';
	import { ciMark, reviewMark } from '../lib/marks.ts';
	import { hashParam, matches } from '../lib/query.ts';

	type Filter = 'all' | 'review' | 'mine';
	const initial = hashParam('filter');
	let filter = $state<Filter>(initial === 'review' || initial === 'mine' ? initial : 'all');
	let drafts = $state(false);
	let repo = $state('');
	let q = $state('');
	let sort = $state<'updated' | 'stale' | 'new'>('updated');

	const review = $derived(new Set(app.github?.reviewRequested ?? []));
	const repoNames = $derived([...new Set(app.pulls.map((p) => p.repo))].sort((a, b) => a.localeCompare(b)));

	const list = $derived(
		app.pulls
			.filter((p) => drafts || !p.isDraft || p.author === app.me)
			.filter((p) => (filter === 'review' ? review.has(p.url) || (!!app.me && p.requested.includes(app.me)) : filter === 'mine' ? p.author === app.me : true))
			.filter((p) => !repo || p.repo === repo)
			.filter((p) => matches(`${p.title} ${p.repo} #${p.number} ${p.author ?? ''} ${p.labels.map((l) => l.name).join(' ')}`, q))
			.toSorted((a, b) =>
				sort === 'new'
					? Date.parse(b.createdAt) - Date.parse(a.createdAt)
					: sort === 'stale'
						? Date.parse(a.updatedAt) - Date.parse(b.updatedAt)
						: Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
			)
	);
</script>

<div class="stack">
	<div class="page-head">
		<h1>Pull requests</h1>
		<span class="muted small">{list.length} of {app.pulls.length} open</span>
	</div>

	<section class="card">
		<div class="toolbar">
			<div class="chips" role="group" aria-label="Show">
				<button class="chip" aria-pressed={filter === 'all'} onclick={() => (filter = 'all')}>All</button>
				<button class="chip" aria-pressed={filter === 'review'} onclick={() => (filter = 'review')}>Needs my review</button>
				<button class="chip" aria-pressed={filter === 'mine'} onclick={() => (filter = 'mine')}>Mine</button>
				<button class="chip" aria-pressed={drafts} onclick={() => (drafts = !drafts)}>Drafts</button>
			</div>
			<input type="search" placeholder="Filter by title, repo, author, label" bind:value={q} aria-label="Filter" />
			<select bind:value={repo} aria-label="Repository">
				<option value="">All repos</option>
				{#each repoNames as name (name)}<option value={name}>{name}</option>{/each}
			</select>
			<select bind:value={sort} aria-label="Sort">
				<option value="updated">Recently updated</option>
				<option value="new">Newest</option>
				<option value="stale">Least recently updated</option>
			</select>
		</div>

		{#if list.length}
			<div class="scroll-x">
				<table class="list">
					<thead><tr><th>Pull request</th><th>Review</th><th>Checks</th><th class="hide-sm num">Size</th><th class="hide-sm">Updated</th></tr></thead>
					<tbody>
						{#each list as p (p.url)}
							{@const r = reviewMark(p.review, p.isDraft)}
							{@const c = ciMark(p.checks)}
							<tr>
								<td class="main">
									<ItemTitle item={p} isPull labels />
									{#if review.has(p.url)}<span class="tag for-you">Your review</span>{/if}
								</td>
								<td><Badge size="sm" mark={r.mark} label={r.label} /></td>
								<td><a class="plain" href="{p.url}/checks" target="_blank" rel="noreferrer"><Badge size="sm" mark={c.mark} label={c.label} /></a></td>
								<td class="hide-sm num mono small"><span class="add">+{p.additions}</span> <span class="del">−{p.deletions}</span></td>
								<td class="hide-sm muted small nowrap">{timeAgo(p.updatedAt, app.now)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<div class="empty">
				{app.pulls.length ? 'No pull requests match.' : app.github ? 'No open pull requests anywhere. Rare.' : 'Add a GitHub token in Settings.'}
			</div>
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

	.for-you {
		margin-top: 4px;
		border-color: var(--series-1);
	}

	.add {
		color: var(--good);
	}

	.del {
		color: var(--critical);
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
