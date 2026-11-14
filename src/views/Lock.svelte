<script lang="ts">
	import { app } from '../lib/app.svelte.ts';
	import { generateCode, passphraseProblem } from '../lib/crypto.ts';

	let mode = $state<'type' | 'code'>('type');
	let passphrase = $state('');
	let confirm = $state('');
	let code = $state(generateCode());
	let saved = $state(false);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let copied = $state(false);

	const isNew = $derived(app.phase === 'new');
	const problem = $derived(mode === 'type' && passphrase ? passphraseProblem(passphrase) : null);
	const canCreate = $derived(
		mode === 'code' ? saved : passphrase.length > 0 && !passphraseProblem(passphrase) && passphrase === confirm
	);

	async function create(e: SubmitEvent) {
		e.preventDefault();
		if (!canCreate) return;
		busy = true;
		await app.create(mode === 'code' ? code : passphrase);
	}

	async function unlock(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		error = null;
		const ok = await app.unlock(passphrase);
		busy = false;
		if (!ok) error = "That isn't it. Check caps lock, and the dashes if it's a generated code.";
		passphrase = '';
	}

	async function copyCode() {
		await navigator.clipboard.writeText(code);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	function startOver() {
		if (confirm_('This deletes your saved tokens and settings from this browser. Your GitHub data is untouched. Start over?')) app.forget();
	}
	const confirm_ = (text: string) => window.confirm(text);

	async function restore(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		try {
			app.importBackup(await file.text());
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		}
	}
</script>

<div class="wrap">
	<div class="card panel">
		<div class="brand">
			<img src="/favicon.svg" alt="" width="28" height="28" />
			<h1>Stillwater</h1>
		</div>

		{#if isNew}
			<p class="lead">Every open pull request, issue and failing build across all your GitHub repos, in one place.</p>
			<ul class="facts small">
				<li>No account. Your tokens are encrypted with what you choose here and stay in this browser.</li>
				<li>Stillwater talks to GitHub directly. There is no Stillwater server that could see them.</li>
				<li>There is no reset either: forget it and you start over with new tokens.</li>
			</ul>

			<div class="chips" role="group" aria-label="How to lock Stillwater">
				<button type="button" class="chip" aria-pressed={mode === 'type'} onclick={() => (mode = 'type')}>Choose a passphrase</button>
				<button type="button" class="chip" aria-pressed={mode === 'code'} onclick={() => (mode = 'code')}>Use a generated code</button>
			</div>

			<form class="fields" onsubmit={create}>
				{#if mode === 'type'}
					<label>
						<span>Passphrase</span>
						<!-- svelte-ignore a11y_autofocus -->
						<input type="password" bind:value={passphrase} autocomplete="new-password" autofocus />
						{#if problem}<small class="muted">{problem}</small>{:else}<small class="muted">12 characters or more. A few unrelated words are easy to type and hard to guess.</small>{/if}
					</label>
					<label>
						<span>Same again</span>
						<input type="password" bind:value={confirm} autocomplete="new-password" />
						{#if confirm && confirm !== passphrase}<small class="muted">Doesn't match yet.</small>{/if}
					</label>
				{:else}
					<div class="code-box">
						<code class="code">{code}</code>
						<div class="row">
							<button type="button" onclick={copyCode}>{copied ? 'Copied' : 'Copy'}</button>
							<button type="button" onclick={() => ((code = generateCode()), (saved = false))}>New code</button>
						</div>
					</div>
					<small class="muted">Keep it in your password manager. It is the only way back in.</small>
					<label class="check">
						<input type="checkbox" bind:checked={saved} />
						<span>I've saved this code</span>
					</label>
				{/if}
				<div class="row">
					<button class="primary" disabled={!canCreate || busy}>{busy ? 'Setting up…' : 'Set up Stillwater'}</button>
				</div>
			</form>

			<div class="foot small muted">
				Moving from another browser?
				<label class="file-link">Restore a backup<input type="file" accept="application/json,.json" onchange={restore} /></label>
			</div>
		{:else}
			<p class="lead">Locked. Enter your passphrase or code to open your tokens.</p>
			<form class="fields" onsubmit={unlock}>
				<label>
					<span>Passphrase or code</span>
					<!-- svelte-ignore a11y_autofocus -->
					<input type="password" bind:value={passphrase} autocomplete="current-password" autofocus />
				</label>
				<div class="row">
					<button class="primary" disabled={!passphrase || busy}>{busy ? 'Unlocking…' : 'Unlock'}</button>
				</div>
			</form>
			<div class="foot small muted">
				Forgot it? There is no reset, by design. <button type="button" class="link" onclick={startOver}>Start over</button>
			</div>
		{/if}

		{#if error}<p class="error-text small" role="alert">{error}</p>{/if}
	</div>
</div>

<style>
	.wrap {
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: 24px 16px;
	}

	.panel {
		width: 100%;
		max-width: 460px;
		padding: 28px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.lead {
		color: var(--text-secondary);
		font-size: 15px;
	}

	.facts {
		margin: 0;
		padding-left: 18px;
		color: var(--text-secondary);
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.fields {
		max-width: none;
	}

	.code-box {
		display: flex;
		flex-direction: column;
		gap: 10px;
		align-items: flex-start;
	}

	.code {
		font-size: 20px;
		letter-spacing: 0.06em;
		padding: 10px 14px;
		background: var(--surface-0);
		border: 1px solid var(--border-strong);
		border-radius: 8px;
		user-select: all;
	}

	.foot {
		border-top: 1px solid var(--border);
		padding-top: 14px;
	}

	.file-link,
	.link {
		color: var(--text-primary);
		text-decoration: underline;
		cursor: pointer;
		background: none;
		border: none;
		padding: 0;
		font-size: inherit;
	}

	.file-link input {
		display: none;
	}

	@media (max-width: 500px) {
		.panel {
			padding: 20px;
		}
		.code {
			font-size: 17px;
		}
	}
</style>
