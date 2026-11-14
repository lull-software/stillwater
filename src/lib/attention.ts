import type { Issue, Pull, Repo, Snapshot } from './github.ts';
import type { MonitorOverview } from './monitor.ts';

/**
 * The two lists on the overview.
 *
 * Needs attention: things that are broken. Outages and errors from
 * Stillwater Monitor, failing CI on default branches, your own PRs failing checks,
 * Dependabot alerts, tokens that stopped working.
 *
 * Waiting on you: work, not breakage. Reviews you were asked for, your PRs
 * that are approved or need changes, issues assigned to you.
 */

export type Severity = 'critical' | 'serious' | 'warning';

export type Problem = {
	key: string;
	severity: Severity;
	title: string;
	detail?: string;
	href: string;
	since?: number;
	source: 'GitHub' | 'Monitor' | 'Stillwater';
};

export type Task = {
	key: string;
	reason: 'review' | 'changes' | 'ready' | 'assigned' | 'failing';
	item: Pull | Issue;
	isPull: boolean;
};

const order: Record<Severity, number> = { critical: 0, serious: 1, warning: 2 };
const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) : undefined);

export function visibleRepos(snapshot: Snapshot, hidden: string[], include: (r: Repo) => boolean) {
	return snapshot.repos.filter((r) => include(r) && !hidden.includes(r.name));
}

export function problems(input: {
	snapshot: Snapshot | null;
	repos: Repo[];
	pulls: Pull[];
	me: string | null;
	monitor: MonitorOverview | null;
	monitorError: string | null;
}): Problem[] {
	const out: Problem[] = [];

	for (const item of input.monitor?.attention ?? []) {
		// Stillwater reads CI and Dependabot from GitHub itself, for every repo.
		if (item.kind === 'ci' || item.kind === 'dependabot') continue;
		out.push({ key: `sw:${item.kind}:${item.title}`, severity: item.health, title: item.title, detail: item.detail, href: item.href, since: item.since, source: 'Monitor' });
	}

	for (const r of input.repos) {
		if (r.isArchived) continue;
		if (r.ci.state === 'FAILURE' || r.ci.state === 'ERROR') {
			out.push({ key: `ci:${r.name}`, severity: 'serious', title: `CI is failing on ${r.name}@${r.ci.branch}`, detail: r.ci.failing.join(', ') || undefined, href: r.ci.url ?? r.url, source: 'GitHub' });
		}
		if (r.dependabot) {
			out.push({ key: `dep:${r.name}`, severity: 'warning', title: `${r.dependabot} open Dependabot alert${r.dependabot === 1 ? '' : 's'} on ${r.name}`, href: `${r.url}/security/dependabot`, source: 'GitHub' });
		}
	}

	for (const p of input.pulls) {
		if (p.author !== input.me || p.isDraft) continue;
		if (p.checks === 'FAILURE' || p.checks === 'ERROR') {
			out.push({ key: `pr-ci:${p.url}`, severity: 'serious', title: `Checks failing on your PR ${p.repo}#${p.number}`, detail: p.title, href: `${p.url}/checks`, since: time(p.updatedAt), source: 'GitHub' });
		}
	}

	for (const t of input.snapshot?.tokens ?? []) {
		if (!t.ok) out.push({ key: `tok:${t.id}`, severity: 'warning', title: `GitHub token "${t.label}" isn't working`, detail: t.error, href: '#/settings', source: 'Stillwater' });
	}
	if (input.monitorError) {
		out.push({ key: 'sw:error', severity: 'warning', title: "Can't reach Stillwater Monitor", detail: input.monitorError, href: '#/settings', source: 'Stillwater' });
	}

	return out.sort((a, b) => order[a.severity] - order[b.severity] || (b.since ?? 0) - (a.since ?? 0));
}

export function tasks(input: { snapshot: Snapshot | null; pulls: Pull[]; issues: Issue[]; me: string | null }): Task[] {
	const { snapshot, me } = input;
	if (!snapshot) return [];
	const review = new Set(snapshot.reviewRequested);
	const assigned = new Set(snapshot.assigned);
	const out: Task[] = [];

	for (const p of input.pulls) {
		if (p.isDraft && p.author !== me) continue;
		if (review.has(p.url) || (me && p.requested.includes(me))) out.push({ key: p.url, reason: 'review', item: p, isPull: true });
		else if (p.author === me && !p.isDraft && p.review === 'CHANGES_REQUESTED') out.push({ key: p.url, reason: 'changes', item: p, isPull: true });
		else if (p.author === me && !p.isDraft && p.review === 'APPROVED' && p.checks !== 'FAILURE' && p.checks !== 'ERROR') out.push({ key: p.url, reason: 'ready', item: p, isPull: true });
		else if (assigned.has(p.url)) out.push({ key: p.url, reason: 'assigned', item: p, isPull: true });
	}
	for (const i of input.issues) {
		if (assigned.has(i.url) || (me && i.assignees.includes(me))) out.push({ key: i.url, reason: 'assigned', item: i, isPull: false });
	}

	const rank = { review: 0, changes: 1, ready: 2, failing: 3, assigned: 4 };
	return out.sort((a, b) => rank[a.reason] - rank[b.reason] || Date.parse(b.item.updatedAt) - Date.parse(a.item.updatedAt));
}

export const reasonLabel: Record<Task['reason'], string> = {
	review: 'Review requested',
	changes: 'Changes requested',
	ready: 'Approved, ready to merge',
	assigned: 'Assigned to you',
	failing: 'Checks failing'
};
