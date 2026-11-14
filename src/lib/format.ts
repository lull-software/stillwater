const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export function timeAgo(when: string | number | null | undefined, now = Date.now()) {
	if (!when) return 'never';
	const ms = typeof when === 'number' ? when : Date.parse(when);
	const minutes = Math.round((now - ms) / 60_000);
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 48) return `${hours} h ago`;
	const days = Math.round(hours / 24);
	if (days < 60) return `${days} days ago`;
	return dateFormat.format(ms);
}

export function plural(n: number, one: string, many = `${one}s`) {
	return `${n} ${n === 1 ? one : many}`;
}

/** Readable text on a GitHub label's background color. */
export function labelText(hex: string) {
	const n = Number.parseInt(hex, 16);
	const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
	return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#0b0b0b' : '#ffffff';
}
