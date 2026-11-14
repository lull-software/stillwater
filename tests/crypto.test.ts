import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveKey, generateCode, newKdfParams, open, passphraseProblem, seal } from '../src/lib/crypto.ts';

// Fewer rounds than the real 600,000, to keep the test fast. Same code path.
const FAST = 1_000;

test('seals and opens with the same passphrase', async () => {
	const params = newKdfParams(FAST);
	const key = await deriveKey('correct horse battery staple', params);
	const sealed = await seal(key, { github: [{ token: 'ghp_x' }] });
	assert.ok(!sealed.ct.includes('ghp_x'));
	const again = await deriveKey('correct horse battery staple', params);
	assert.deepEqual(await open(again, sealed), { github: [{ token: 'ghp_x' }] });
});

test('a wrong passphrase fails to open', async () => {
	const params = newKdfParams(FAST);
	const sealed = await seal(await deriveKey('right passphrase here', params), { a: 1 });
	await assert.rejects(open(await deriveKey('wrong passphrase here', params), sealed));
});

test('a changed ciphertext fails to open', async () => {
	const params = newKdfParams(FAST);
	const key = await deriveKey('right passphrase here', params);
	const sealed = await seal(key, { a: 1 });
	const bytes = Buffer.from(sealed.ct, 'base64');
	bytes[0] ^= 1;
	await assert.rejects(open(key, { ...sealed, ct: bytes.toString('base64') }));
});

test('every seal uses a fresh IV', async () => {
	const key = await deriveKey('right passphrase here', newKdfParams(FAST));
	const [a, b] = [await seal(key, 1), await seal(key, 1)];
	assert.notEqual(a.iv, b.iv);
	assert.notEqual(a.ct, b.ct);
});

test('the same passphrase with another salt gives another key', async () => {
	const sealed = await seal(await deriveKey('same passphrase here', newKdfParams(FAST)), 1);
	await assert.rejects(open(await deriveKey('same passphrase here', newKdfParams(FAST)), sealed));
});

test('generated codes are 16 Crockford characters in groups of four', () => {
	const code = generateCode();
	assert.match(code, /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
	assert.notEqual(generateCode(), code);
	assert.equal(passphraseProblem(code), null);
});

test('short or repetitive passphrases are flagged', () => {
	assert.ok(passphraseProblem('short'));
	assert.ok(passphraseProblem('aaaaaaaaaaaaaaaa'));
	assert.equal(passphraseProblem('otter lantern quarry'), null);
});
