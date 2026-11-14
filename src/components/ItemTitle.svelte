<script lang="ts">
	import type { Issue, Pull } from '../lib/github.ts';
	import { labelText } from '../lib/format.ts';

	let { item, isPull, labels = false }: { item: Pull | Issue; isPull: boolean; labels?: boolean } = $props();
</script>

<div class="title-line">
	<a class="plain title" href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
	{#if labels}
		{#each item.labels as l (l.name)}
			<span class="label" style:background="#{l.color}" style:color={labelText(l.color)}>{l.name}</span>
		{/each}
	{/if}
</div>
<div class="muted small sub">
	<a class="plain" href="https://github.com/{item.repo}/{isPull ? 'pulls' : 'issues'}" target="_blank" rel="noreferrer">{item.repo}</a>#{item.number}
	{#if item.author}
		· {#if item.avatar}<img class="avatar" src={item.avatar} alt="" />{/if}
		{item.author}
	{/if}
</div>

<style>
	.title-line {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 8px;
	}

	.title {
		font-weight: 500;
		overflow-wrap: anywhere;
	}

	.sub {
		margin-top: 1px;
	}

	.avatar {
		width: 14px;
		height: 14px;
		vertical-align: -2px;
	}
</style>
