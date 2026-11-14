import { deriveKey, newKdfParams, open, seal, type KdfParams, type Sealed } from './crypto.ts';
import type { GithubToken, Snapshot } from './github.ts';
import type { MonitorConnection, MonitorOverview } from './monitor.ts';

/**
 * What Stillwater keeps, all of it in this browser's localStorage and all of it
 * encrypted with the key from your passphrase:
 *
 *   stillwater.vault   your tokens and preferences
 *   stillwater.cache   the last data fetched, so the page fills in at once
 *
 * The only plaintext is the KDF salt and round count, which are not secret.
 * There is no account and no server copy: clearing site data, or "Forget
 * everything" in Settings, deletes it for good.
 */

export type Prefs = {
	includeForks: boolean;
	includeArchived: boolean;
	hidden: string[];
	/** Minutes without input before locking. 0: only on reload or Lock. */
	autoLockMinutes: number;
};

export type VaultData = {
	github: GithubToken[];
	/** Stillwater Monitor deployments, each with its own read-only token. */
	monitors: MonitorConnection[];
	prefs: Prefs;
};

/** Monitor overviews are keyed by the monitor's address. */
export type Cache = { github: Snapshot | null; monitors: Record<string, MonitorOverview> };

type StoredVault = { kind: 'stillwater-vault'; v: 1; kdf: KdfParams; data: Sealed };

const VAULT_KEY = 'stillwater.vault';
const CACHE_KEY = 'stillwater.cache';

export const defaultPrefs: Prefs = { includeForks: false, includeArchived: false, hidden: [], autoLockMinutes: 30 };

export const emptyData = (): VaultData => ({ github: [], monitors: [], prefs: { ...defaultPrefs } });

function read(): StoredVault | null {
	const raw = localStorage.getItem(VAULT_KEY);
	if (!raw) return null;
	try {
		return parseStored(JSON.parse(raw));
	} catch {
		return null;
	}
}

function parseStored(value: any): StoredVault {
	if (
		value?.kind !== 'stillwater-vault' ||
		value.v !== 1 ||
		value.kdf?.name !== 'PBKDF2' ||
		typeof value.kdf.salt !== 'string' ||
		!Number.isInteger(value.kdf.iterations) ||
		value.kdf.iterations < 100_000 ||
		typeof value.data?.iv !== 'string' ||
		typeof value.data?.ct !== 'string'
	) {
		throw new Error('This is not a Stillwater backup.');
	}
	return value as StoredVault;
}

export function hasVault() {
	return read() !== null;
}

export async function createVault(passphrase: string) {
	const kdf = newKdfParams();
	const key = await deriveKey(passphrase, kdf);
	const data = emptyData();
	localStorage.setItem(VAULT_KEY, JSON.stringify({ kind: 'stillwater-vault', v: 1, kdf, data: await seal(key, data) } satisfies StoredVault));
	localStorage.removeItem(CACHE_KEY);
	return { key, data };
}

/** null for a wrong passphrase. */
export async function unlockVault(passphrase: string): Promise<{ key: CryptoKey; data: VaultData } | null> {
	const stored = read();
	if (!stored) return null;
	const key = await deriveKey(passphrase, stored.kdf);
	try {
		const data = await open<VaultData>(key, stored.data);
		return { key, data: { ...emptyData(), ...data, monitors: data.monitors ?? [], prefs: { ...defaultPrefs, ...data.prefs } } };
	} catch {
		return null;
	}
}

export async function saveVault(key: CryptoKey, data: VaultData) {
	const stored = read();
	if (!stored) throw new Error('No vault to save into.');
	localStorage.setItem(VAULT_KEY, JSON.stringify({ ...stored, data: await seal(key, data) }));
}

/** New salt, new key; the cache is re-sealed under it too. */
export async function changePassphrase(oldKey: CryptoKey, data: VaultData, passphrase: string) {
	const cache = await loadCache(oldKey);
	const kdf = newKdfParams();
	const key = await deriveKey(passphrase, kdf);
	localStorage.setItem(VAULT_KEY, JSON.stringify({ kind: 'stillwater-vault', v: 1, kdf, data: await seal(key, data) } satisfies StoredVault));
	if (cache) await saveCache(key, cache);
	return key;
}

export async function loadCache(key: CryptoKey): Promise<Cache | null> {
	const raw = localStorage.getItem(CACHE_KEY);
	if (!raw) return null;
	try {
		return await open<Cache>(key, JSON.parse(raw));
	} catch {
		return null;
	}
}

export async function saveCache(key: CryptoKey, cache: Cache) {
	try {
		localStorage.setItem(CACHE_KEY, JSON.stringify(await seal(key, cache)));
	} catch {
		// Over the storage quota: the cache is only a head start, so go without.
		localStorage.removeItem(CACHE_KEY);
	}
}

/** The vault exactly as stored: still encrypted, still needs your passphrase. */
export function exportVault(): string {
	const stored = read();
	if (!stored) throw new Error('Nothing to back up yet.');
	return JSON.stringify(stored, null, 2);
}

/** Replaces this browser's vault with a backup. Unlock it with the passphrase it was made with. */
export function importVault(text: string) {
	const stored = parseStored(JSON.parse(text));
	localStorage.setItem(VAULT_KEY, JSON.stringify(stored));
	localStorage.removeItem(CACHE_KEY);
}

export function forgetEverything() {
	localStorage.removeItem(VAULT_KEY);
	localStorage.removeItem(CACHE_KEY);
}
