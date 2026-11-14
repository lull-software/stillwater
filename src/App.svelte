<script lang="ts">
	import { app, type Route } from './lib/app.svelte.ts';
	import { timeAgo } from './lib/format.ts';
	import Lock from './views/Lock.svelte';
	import Overview from './views/Overview.svelte';
	import Pulls from './views/Pulls.svelte';
	import Issues from './views/Issues.svelte';
	import Repos from './views/Repos.svelte';
	import Settings from './views/Settings.svelte';

	const nav: { route: Route; label: string }[] = [
		{ route: 'overview', label: 'Overview' },
		{ route: 'pulls', label: 'Pull requests' },
		{ route: 'issues', label: 'Issues' },
		{ route: 'repos', label: 'Repos' },
		{ route: 'settings', label: 'Settings' }
	];

	const counts = $derived<Partial<Record<Route, number>>>({ pulls: app.pulls.length, issues: app.issues.length });

	$effect(() => {
		const titles: Record<Route, string> = { overview: 'Overview', pulls: 'Pull requests', issues: 'Issues', repos: 'Repos', settings: 'Settings' };
		document.title = app.phase === 'unlocked' ? `${titles[app.route]} · Stillwater` : 'Stillwater';
	});
</script>

{#if app.phase !== 'unlocked'}
	<Lock />
{:else}
	<div class="shell">
		<header class="top">
			<a class="brand" href="#/">
				<img src="/favicon.svg" alt="" width="20" height="20" />
				Stillwater
			</a>
			<nav>
				{#each nav as item (item.route)}
					<a href="#/{item.route === 'overview' ? '' : item.route}" aria-current={app.route === item.route ? 'page' : undefined}>
						{item.label}
						{#if counts[item.route]}<span class="count">{counts[item.route]}</span>{/if}
					</a>
				{/each}
			</nav>
			<div class="right">
				{#if app.data.github.length}
					<span class="muted small sync" aria-live="polite">
						{#if app.syncing}Syncing…{:else if app.github}Synced {timeAgo(app.github.fetchedAt, app.now)}{/if}
					</span>
					<button onclick={() => app.sync()} disabled={app.syncing} aria-label="Sync now">↻</button>
				{/if}
				<button onclick={() => app.lock()}>Lock</button>
			</div>
		</header>
		<main>
			{#if app.syncError}<p class="error-text small banner" role="alert">{app.syncError}</p>{/if}
			{#if app.route === 'overview'}<Overview />
			{:else if app.route === 'pulls'}<Pulls />
			{:else if app.route === 'issues'}<Issues />
			{:else if app.route === 'repos'}<Repos />
			{:else}<Settings />{/if}
		</main>
	</div>
{/if}

<style>
	.top {
		position: sticky;
		top: 0;
		z-index: 20;
		display: flex;
		align-items: center;
		gap: 24px;
		padding: 0 24px;
		height: 52px;
		background: var(--surface-1);
		border-bottom: 1px solid var(--border);
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 650;
		text-decoration: none;
		flex: none;
	}

	nav {
		display: flex;
		gap: 4px;
	}

	nav a {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		border-radius: 7px;
		text-decoration: none;
		color: var(--text-secondary);
		white-space: nowrap;
	}

	nav a:hover,
	nav a[aria-current='page'] {
		color: var(--text-primary);
		background: var(--surface-2);
	}

	.count {
		font-size: 11px;
		line-height: 17px;
		min-width: 17px;
		padding: 0 5px;
		text-align: center;
		border-radius: 999px;
		background: var(--surface-0);
		border: 1px solid var(--border-strong);
		color: var(--text-secondary);
		font-variant-numeric: tabular-nums;
	}

	.right {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 8px;
		flex: none;
	}

	main {
		max-width: 1320px;
		margin: 0 auto;
		padding: 24px;
	}

	.banner {
		margin-bottom: 16px;
	}

	@media (max-width: 900px) {
		.top {
			flex-wrap: wrap;
			height: auto;
			gap: 0 12px;
			padding: 8px 12px 0;
		}

		nav {
			order: 3;
			width: 100%;
			overflow-x: auto;
			padding: 6px 0 8px;
			scrollbar-width: none;
		}

		.sync {
			display: none;
		}

		main {
			padding: 16px 12px;
		}
	}
</style>
