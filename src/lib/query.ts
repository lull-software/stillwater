/** `#/pulls?filter=review` → "review". Lets the overview link into a filtered list. */
export function hashParam(name: string): string | null {
	const query = location.hash.split('?')[1];
	return query ? new URLSearchParams(query).get(name) : null;
}

export function matches(text: string, query: string) {
	const q = query.trim().toLowerCase();
	return !q || q.split(/\s+/).every((word) => text.toLowerCase().includes(word));
}
