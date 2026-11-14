/**
 * The vault's cryptography, with no storage or UI in it, so it can be tested
 * on its own (tests/crypto.test.ts).
 *
 * Your passphrase goes through PBKDF2-SHA-256 (600,000 rounds, a random
 * 16-byte salt) to make an AES-256-GCM key. The key is never stored or sent
 * anywhere: it lives in this tab's memory while Stillwater is unlocked. What is
 * stored is ciphertext. GCM is authenticated, so a wrong passphrase fails to
 * decrypt rather than producing garbage.
 */

export const KDF_ITERATIONS = 600_000;

export type Sealed = { iv: string; ct: string };

export type KdfParams = { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toBase64(bytes: Uint8Array): string {
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
	const s = atob(text);
	const out = new Uint8Array(s.length);
	for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
	return out;
}

export function newKdfParams(iterations = KDF_ITERATIONS): KdfParams {
	return { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toBase64(crypto.getRandomValues(new Uint8Array(16))) };
}

/** Non-extractable: even script on this page can't read the key's bytes out. */
export async function deriveKey(passphrase: string, params: KdfParams): Promise<CryptoKey> {
	const material = await crypto.subtle.importKey('raw', enc.encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
	return crypto.subtle.deriveKey(
		{ name: 'PBKDF2', hash: params.hash, iterations: params.iterations, salt: fromBase64(params.salt) },
		material,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

export async function seal(key: CryptoKey, value: unknown): Promise<Sealed> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value)));
	return { iv: toBase64(iv), ct: toBase64(new Uint8Array(ct)) };
}

/** Throws if the key is wrong or the data was changed. */
export async function open<T>(key: CryptoKey, sealed: Sealed): Promise<T> {
	const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(sealed.iv) }, key, fromBase64(sealed.ct));
	return JSON.parse(dec.decode(plain)) as T;
}

// Crockford base32: no I, L, O or U, so a code read aloud or retyped survives.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * A random unlock code like `7KQM-3XRP-WT9D-HV2C`: 16 characters, 80 bits.
 * Rejection sampling isn't needed: 256 is a multiple of 32.
 */
export function generateCode(groups = 4): string {
	const bytes = crypto.getRandomValues(new Uint8Array(groups * 4));
	const chars = [...bytes].map((b) => ALPHABET[b % 32]);
	return Array.from({ length: groups }, (_, i) => chars.slice(i * 4, i * 4 + 4).join('')).join('-');
}

/**
 * A rough read on a typed passphrase, to steer people off short ones. Not a
 * real strength meter: it can't know "Summer2026!" is a bad idea.
 */
export function passphraseProblem(passphrase: string): string | null {
	const p = passphrase.trim();
	if (p.length < 12) return 'Use at least 12 characters. A few unrelated words work well.';
	if (new Set(p.toLowerCase()).size < 6) return 'Too repetitive. Mix in more different characters or words.';
	return null;
}
