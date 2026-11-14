/**
 * Everything Stillwater knows about GitHub, fetched straight from the browser
 * to api.github.com (GitHub allows cross-origin API calls). No server in
 * between.
 *
 * Per token, three kinds of GraphQL request:
 *   1. every repo the token can see, 50 a page: counts, CI on the default
 *      branch, Dependabot alerts
 *   2. open pull requests and issues, only for repos that have any, ten repos
 *      a request
 *   3. two searches: PRs waiting on your review, and what is assigned to you
 * Several tokens (one per owner, for fine-grained tokens) are merged by repo.
 */

export type CiState = 'SUCCESS' | 'FAILURE' | 'ERROR' | 'PENDING' | 'EXPECTED' | null;
export type ReviewDecision = 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
export type Label = { name: string; color: string };

export type Repo = {
	name: string; // owner/name
	owner: string;
	url: string;
	isPrivate: boolean;
	isFork: boolean;
	isArchived: boolean;
	pushedAt: string | null;
	openIssues: number;
	openPulls: number;
	/** null: the token may not read Dependabot alerts for this repo. */
	dependabot: number | null;
	ci: { state: CiState; branch: string | null; url: string | null; failing: string[] };
};

export type Pull = {
	url: string;
	repo: string;
	number: number;
	title: string;
	author: string | null;
	avatar: string | null;
	isDraft: boolean;
	createdAt: string;
	updatedAt: string;
	review: ReviewDecision;
	checks: CiState;
	requested: string[];
	labels: Label[];
	comments: number;
	additions: number;
	deletions: number;
};

export type Issue = {
	url: string;
	repo: string;
	number: number;
	title: string;
	author: string | null;
	avatar: string | null;
	createdAt: string;
	updatedAt: string;
	labels: Label[];
	assignees: string[];
	comments: number;
};

export type TokenReport = {
	id: string;
	label: string;
	ok: boolean;
	login?: string;
	repos?: number;
	error?: string;
	rateRemaining?: number;
	rateResetAt?: string;
};

export type Snapshot = {
	fetchedAt: number;
	viewer: { login: string; avatarUrl: string } | null;
	repos: Repo[];
	pulls: Pull[];
	issues: Issue[];
	/** PR urls GitHub's search says are waiting on your review (teams included). */
	reviewRequested: string[];
	/** Issue and PR urls assigned to you. */
	assigned: string[];
	tokens: TokenReport[];
	/** Repos with more open PRs or issues than one fetch takes (50 each). */
	truncated: string[];
};

export type GithubToken = { id: string; label: string; token: string };

export type ScopePrefs = { includeForks: boolean; includeArchived: boolean; hidden: string[] };

const API = 'https://api.github.com/graphql';
const PAGE = 50;
const MAX_PAGES = 10;
const PER_DETAIL_REQUEST = 10;
const PER_REPO = 50;

class GithubError extends Error {}

type GqlResponse<T> = { data?: T; errors?: { message: string; path?: (string | number)[]; type?: string }[] };

async function gql<T>(token: string, query: string, variables: Record<string, unknown> = {}): Promise<GqlResponse<T>> {
	let res: Response;
	try {
		res = await fetch(API, {
			method: 'POST',
			headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
			body: JSON.stringify({ query, variables }),
			// Never send cookies or a referrer along; the token is all GitHub needs.
			credentials: 'omit',
			referrerPolicy: 'no-referrer',
			cache: 'no-store'
		});
	} catch {
		throw new GithubError('Could not reach GitHub. Are you offline?');
	}
	if (res.status === 401) throw new GithubError('GitHub rejected this token: it has expired, been revoked, or was mistyped.');
	if (res.status === 403 || res.status === 429) {
		const reset = res.headers.get('x-ratelimit-reset');
		const at = reset ? new Date(Number(reset) * 1000).toLocaleTimeString() : 'later';
		throw new GithubError(`GitHub rate limit reached. It resets at ${at}.`);
	}
	if (!res.ok) throw new GithubError(`GitHub answered HTTP ${res.status}.`);
	const json = (await res.json()) as GqlResponse<T>;
	if (!json.data) throw new GithubError(json.errors?.map((e) => e.message).join('; ') || 'GitHub returned no data.');
	return json;
}

type Node = Record<string, any>;

const REPO_FIELDS = `
	nameWithOwner url isPrivate isFork isArchived pushedAt owner { login }
	issues(states: OPEN) { totalCount }
	pullRequests(states: OPEN) { totalCount }
	vulnerabilityAlerts(states: OPEN) { totalCount }
	defaultBranchRef {
		name
		target { ... on Commit { url statusCheckRollup { state contexts(first: 30) { nodes {
			... on CheckRun { name conclusion }
			... on StatusContext { context state }
		} } } } }
	}`;

const REPOS_QUERY = `query($after: String) {
	rateLimit { remaining resetAt }
	viewer {
		login avatarUrl
		repositories(first: ${PAGE}, after: $after, ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER], orderBy: { field: PUSHED_AT, direction: DESC }) {
			pageInfo { hasNextPage endCursor }
			nodes { ${REPO_FIELDS} }
		}
	}
}`;

const PULL_FIELDS = `fragment P on PullRequest {
	number title url isDraft createdAt updatedAt reviewDecision additions deletions
	author { login avatarUrl }
	labels(first: 6) { nodes { name color } }
	comments { totalCount }
	reviewRequests(first: 10) { nodes { requestedReviewer { ... on User { login } ... on Team { slug } } } }
	commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
}`;

const ISSUE_FIELDS = `fragment I on Issue {
	number title url createdAt updatedAt
	author { login avatarUrl }
	labels(first: 6) { nodes { name color } }
	assignees(first: 5) { nodes { login } }
	comments { totalCount }
}`;

const FOR_YOU_QUERY = `{
	reviewRequested: search(type: ISSUE, query: "is:open is:pr review-requested:@me archived:false", first: 100) {
		nodes { ... on PullRequest { url } }
	}
	assigned: search(type: ISSUE, query: "is:open assignee:@me archived:false", first: 100) {
		nodes { ... on Issue { url } ... on PullRequest { url } }
	}
}`;

const BAD = new Set(['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE']);

function toRepo(n: Node): Repo {
	const commit = n.defaultBranchRef?.target;
	const rollup = commit?.statusCheckRollup;
	const contexts: Node[] = rollup?.contexts?.nodes ?? [];
	return {
		name: n.nameWithOwner,
		owner: n.owner.login,
		url: n.url,
		isPrivate: n.isPrivate,
		isFork: n.isFork,
		isArchived: n.isArchived,
		pushedAt: n.pushedAt,
		openIssues: n.issues.totalCount,
		openPulls: n.pullRequests.totalCount,
		dependabot: n.vulnerabilityAlerts?.totalCount ?? null,
		ci: {
			state: rollup?.state ?? null,
			branch: n.defaultBranchRef?.name ?? null,
			url: commit?.url ?? null,
			failing: contexts
				.map((c) => ('context' in c ? { name: c.context, state: c.state } : { name: c.name, state: c.conclusion }))
				.filter((c) => BAD.has(c.state))
				.map((c) => c.name)
		}
	};
}

function toPull(repo: string, n: Node): Pull {
	return {
		url: n.url,
		repo,
		number: n.number,
		title: n.title,
		author: n.author?.login ?? null,
		avatar: n.author?.avatarUrl ?? null,
		isDraft: n.isDraft,
		createdAt: n.createdAt,
		updatedAt: n.updatedAt,
		review: n.reviewDecision ?? null,
		checks: n.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state ?? null,
		requested: (n.reviewRequests?.nodes ?? [])
			.map((r: Node) => r.requestedReviewer?.login ?? (r.requestedReviewer?.slug ? `team:${r.requestedReviewer.slug}` : null))
			.filter(Boolean),
		labels: n.labels?.nodes ?? [],
		comments: n.comments?.totalCount ?? 0,
		additions: n.additions ?? 0,
		deletions: n.deletions ?? 0
	};
}

function toIssue(repo: string, n: Node): Issue {
	return {
		url: n.url,
		repo,
		number: n.number,
		title: n.title,
		author: n.author?.login ?? null,
		avatar: n.author?.avatarUrl ?? null,
		createdAt: n.createdAt,
		updatedAt: n.updatedAt,
		labels: n.labels?.nodes ?? [],
		assignees: (n.assignees?.nodes ?? []).map((a: Node) => a.login),
		comments: n.comments?.totalCount ?? 0
	};
}

export function inScope(repo: Repo, prefs: ScopePrefs) {
	if (repo.isFork && !prefs.includeForks) return false;
	if (repo.isArchived && !prefs.includeArchived) return false;
	return true;
}

async function fetchWithToken(t: GithubToken, prefs: ScopePrefs) {
	const repos: Repo[] = [];
	let viewer: Snapshot['viewer'] = null;
	let rate: { remaining: number; resetAt: string } | undefined;
	let after: string | null = null;
	for (let page = 0; page < MAX_PAGES; page++) {
		const res: GqlResponse<Node> = await gql<Node>(t.token, REPOS_QUERY, { after });
		const data: Node = res.data!;
		viewer = { login: data.viewer.login, avatarUrl: data.viewer.avatarUrl };
		rate = data.rateLimit;
		repos.push(...data.viewer.repositories.nodes.filter(Boolean).map(toRepo));
		const info: Node = data.viewer.repositories.pageInfo;
		if (!info.hasNextPage) break;
		after = info.endCursor;
	}

	// Only repos with something open, and only the ones you look at.
	const busy = repos.filter((r) => inScope(r, prefs) && !prefs.hidden.includes(r.name) && (r.openPulls > 0 || r.openIssues > 0));
	const chunks: Repo[][] = [];
	for (let i = 0; i < busy.length; i += PER_DETAIL_REQUEST) chunks.push(busy.slice(i, i + PER_DETAIL_REQUEST));
	const detail = (chunk: Repo[]) => {
		const aliases = chunk.map((r, j) => {
			const [owner, name] = r.name.split('/');
			return `r${j}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) {
				pullRequests(states: OPEN, first: ${PER_REPO}, orderBy: { field: UPDATED_AT, direction: DESC }) { nodes { ...P } }
				issues(states: OPEN, first: ${PER_REPO}, orderBy: { field: UPDATED_AT, direction: DESC }) { nodes { ...I } }
			}`;
		});
		return gql<Record<string, Node | null>>(t.token, `query {\n${aliases.join('\n')}\n}\n${PULL_FIELDS}\n${ISSUE_FIELDS}`);
	};
	// GitHub asks for no more than a few concurrent requests per token; this
	// is at most a handful.
	const [forYou, ...details] = await Promise.all([gql<Node>(t.token, FOR_YOU_QUERY), ...chunks.map(detail)]);

	const pulls: Pull[] = [];
	const issues: Issue[] = [];
	chunks.forEach((chunk, c) => {
		chunk.forEach((r, j) => {
			const node = details[c].data?.[`r${j}`];
			if (!node) return;
			pulls.push(...(node.pullRequests?.nodes ?? []).filter(Boolean).map((n: Node) => toPull(r.name, n)));
			issues.push(...(node.issues?.nodes ?? []).filter(Boolean).map((n: Node) => toIssue(r.name, n)));
		});
	});
	const urls = (key: string) => ((forYou.data?.[key]?.nodes ?? []) as Node[]).map((n) => n?.url).filter(Boolean) as string[];

	return {
		viewer,
		repos,
		pulls,
		issues,
		reviewRequested: urls('reviewRequested'),
		assigned: urls('assigned'),
		report: {
			id: t.id,
			label: t.label,
			ok: true,
			login: viewer?.login,
			repos: repos.length,
			rateRemaining: rate?.remaining,
			rateResetAt: rate?.resetAt
		} satisfies TokenReport
	};
}

function uniqueBy<T>(items: T[], key: (t: T) => string) {
	const seen = new Map<string, T>();
	for (const item of items) if (!seen.has(key(item))) seen.set(key(item), item);
	return [...seen.values()];
}

/** Fetches with every token at once. A token that fails is reported, not fatal. */
export async function fetchSnapshot(tokens: GithubToken[], prefs: ScopePrefs, now = Date.now()): Promise<Snapshot> {
	const results = await Promise.allSettled(tokens.map((t) => fetchWithToken(t, prefs)));
	const ok = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
	const reports: TokenReport[] = results.map((r, i) =>
		r.status === 'fulfilled'
			? r.value.report
			: { id: tokens[i].id, label: tokens[i].label, ok: false, error: r.reason instanceof Error ? r.reason.message : String(r.reason) }
	);
	const repos = uniqueBy(ok.flatMap((r) => r.repos), (r) => r.name);
	const pulls = uniqueBy(ok.flatMap((r) => r.pulls), (p) => p.url);
	const issues = uniqueBy(ok.flatMap((r) => r.issues), (i) => i.url);
	const count = (list: { repo: string }[], repo: string) => list.filter((x) => x.repo === repo).length;
	return {
		fetchedAt: now,
		viewer: ok.find((r) => r.viewer)?.viewer ?? null,
		repos,
		pulls,
		issues,
		reviewRequested: [...new Set(ok.flatMap((r) => r.reviewRequested))],
		assigned: [...new Set(ok.flatMap((r) => r.assigned))],
		tokens: reports,
		truncated: repos
			.filter((r) => (r.openPulls > PER_REPO && count(pulls, r.name) >= PER_REPO) || (r.openIssues > PER_REPO && count(issues, r.name) >= PER_REPO))
			.map((r) => r.name)
	};
}

/** Checks one token before it is saved: who it belongs to and how many repos it sees. */
export async function testToken(token: string): Promise<{ login: string }> {
	const res = await gql<Node>(token, '{ viewer { login } }');
	return { login: res.data!.viewer.login };
}

/**
 * A link to GitHub's new fine-grained token page with the read-only
 * permissions filled in. GitHub shows the form for review; nothing is made
 * until you press Generate. Unknown parameters are ignored by GitHub, so the
 * form is still worth checking before you submit it.
 */
export function newTokenUrl(owner?: string) {
	const params = new URLSearchParams({
		name: owner ? `Stillwater (${owner})`.slice(0, 40) : 'Stillwater',
		description: 'Read-only token for Stillwater. Stored encrypted in my browser only.',
		expires_in: '90',
		contents: 'read',
		issues: 'read',
		pull_requests: 'read',
		statuses: 'read',
		checks: 'read',
		vulnerability_alerts: 'read'
	});
	if (owner) params.set('target_name', owner);
	return `https://github.com/settings/personal-access-tokens/new?${params}`;
}
