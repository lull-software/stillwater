<script lang="ts">
	import type { Mark } from '../lib/marks.ts';

	let { mark, label, size = 'md', quiet = false }: { mark: Mark; label: string; size?: 'sm' | 'md'; quiet?: boolean } = $props();
</script>

<!-- Shape differs per state as well as color, so it reads in grayscale and for color-blind viewers. -->
<span class="badge {size}" data-mark={mark}>
	<svg viewBox="0 0 16 16" aria-hidden="true">
		{#if mark === 'good'}
			<circle cx="8" cy="8" r="7" fill="var(--good)" />
			<path d="M4.8 8.3 7 10.4l4.2-4.6" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
		{:else if mark === 'warning'}
			<path d="M8 1.5 15 14H1z" fill="var(--warning)" stroke="var(--warning)" stroke-width="1.5" stroke-linejoin="round" />
			<path d="M8 6v3.6" stroke="#1a1a19" stroke-width="1.8" stroke-linecap="round" />
			<circle cx="8" cy="11.8" r="1" fill="#1a1a19" />
		{:else if mark === 'serious'}
			<rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="var(--serious)" />
			<path d="M8 4.5v4.3" stroke="#1a1a19" stroke-width="1.8" stroke-linecap="round" />
			<circle cx="8" cy="11.3" r="1" fill="#1a1a19" />
		{:else if mark === 'critical'}
			<circle cx="8" cy="8" r="7" fill="var(--critical)" />
			<path d="m5.4 5.4 5.2 5.2m0-5.2-5.2 5.2" stroke="#fff" stroke-width="1.8" stroke-linecap="round" />
		{:else if mark === 'info'}
			<circle cx="8" cy="8" r="7" fill="var(--series-1)" />
			<circle cx="8" cy="8" r="2.6" fill="#fff" />
		{:else}
			<circle cx="8" cy="8" r="6" fill="none" stroke="var(--unknown)" stroke-width="2" stroke-dasharray="2.5 2" />
		{/if}
	</svg>
	<span class="text" class:sr-only={quiet}>{label}</span>
</span>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--text-primary);
		white-space: nowrap;
	}

	svg {
		width: 15px;
		height: 15px;
		flex: none;
	}

	.sm svg {
		width: 13px;
		height: 13px;
	}

	.sm .text {
		font-size: 12.5px;
	}

	[data-mark='unknown'] .text {
		color: var(--text-muted);
	}
</style>
