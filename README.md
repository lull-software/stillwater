# Stillwater

Every open pull request, issue and failing build across all your GitHub
repos, in one place. GitHub shows you one repo at a time; Stillwater shows you
what is waiting on you across all of them.

**Local-first.** No account, no server, no database. Stillwater is a static
page that runs in your browser and talks to GitHub directly. Your tokens are
encrypted with a passphrase you choose and never leave your browser, except
to go to `api.github.com`.

By [Lull](https://github.com/lull-software).

## What it shows

| Page | What's on it |
|---|---|
| **Overview** | **Needs attention**: failing CI on default branches, your PRs with failing checks, Dependabot alerts, tokens that stopped working. **Waiting on you**: reviews asked of you, your PRs that are approved or need changes, issues assigned to you |
| **Pull requests** | Every open PR, with review state, checks and size. Filter by "Needs my review", "Mine", repo or text |
| **Issues** | Every open issue, with labels and assignees. Filter by "Assigned to me", "Opened by me", "Unassigned", repo or text |
| **Repos** | CI, open PRs and issues, Dependabot alerts and last push per repo. Hide the ones you don't care about |
| **Settings** | Tokens, which repos, the Stillwater Monitor connection, lock and backup |

It refreshes every 5 minutes while the tab is open, and on the ↻ button.

### With Stillwater Monitor

If you run [Stillwater Monitor](https://github.com/lull-software/stillwater-monitor)
(self-hosted uptime and error monitoring on Cloudflare), connect it in
Settings. Outages, missed cron jobs and new errors then show up under Needs
attention, each repo shows its project's health, and the overview gets a
Projects table. See [Connect Stillwater Monitor](#connect-stillwater-monitor).

## How your data is kept

- **Tokens and settings** live in this browser's `localStorage`, encrypted
  with AES-256-GCM. The key is derived from your passphrase with PBKDF2-SHA-256
  (600,000 rounds, random salt) and is held in memory only while Stillwater is
  unlocked. Locking, closing the tab, or the auto-lock (30 minutes idle by
  default) drops it.
- **Fetched data** (PR titles, repo names) is cached in the same storage,
  encrypted with the same key, so the page fills in at once when you unlock.
- **Where requests go.** The page's Content Security Policy lets it connect
  to `api.github.com` and nowhere else (plus your Stillwater Monitor, if you set one;
  see [MONITOR_ORIGINS](#monitor_origins)). The browser enforces that,
  so a bug in Stillwater still couldn't send your token anywhere else.
- **No server.** The Cloudflare deployment serves static files and nothing
  else: no Worker code, no logs of yours, no cookies, no analytics.
- **No reset.** There's nothing to recover from. Forget your passphrase and
  you start over by adding your tokens again.

[`src/lib/crypto.ts`](src/lib/crypto.ts) and
[`src/lib/vault.ts`](src/lib/vault.ts) are short; read them.

**About trust.** Local-first protects your tokens from a server, but not
from the page itself: whoever serves the page decides what code runs in it.
Use a copy you deployed yourself, or one run by someone you trust. Deploying
your own takes two minutes and costs nothing.

## Deploy your own

Stillwater is static files on Cloudflare Workers. The free plan is plenty.

### With the button

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/lull-software/stillwater)

It copies this repo to your GitHub account and deploys it to yours. Each push
to your copy deploys again. There are no secrets to enter.

### From a terminal

You need Node 22 or later and a Cloudflare account.

```sh
git clone https://github.com/lull-software/stillwater && cd stillwater
npm install
npx wrangler login
npm run deploy
```

It prints your address, `https://stillwater.<you>.workers.dev`. For your own
domain, add it under the Worker's **Settings › Domains & Routes** in the
Cloudflare dashboard, or add to `wrangler.jsonc`:

```jsonc
"routes": [{ "pattern": "stillwater.example.com", "custom_domain": true }]
```

To update: `git pull && npm run deploy`.

### MONITOR_ORIGINS

A build setting that decides which Stillwater Monitor addresses the page may connect
to:

| Value | Page may connect to | For |
|---|---|---|
| unset (default) | GitHub and any `https://` address | a copy several people use, each with their own Stillwater Monitor |
| `""` (empty) | GitHub only | if you don't use Stillwater Monitor: the strictest |
| `"https://monitor.example.com"` | GitHub and that address (space separated for more) | your own copy with your own Stillwater Monitor |

```sh
MONITOR_ORIGINS="https://monitor.example.com" npm run deploy
```

With the button or Workers Builds, set it as a **build variable** on the
Worker (Settings › Build › Variables). Whatever it is set to, Stillwater only
ever sends the Stillwater Monitor token to the one address you enter in Settings.

## Set it up

1. Open your Stillwater and choose a passphrase (12 characters or more), or
   take a generated code like `7KQM-3XRP-WT9D-HV2C`. Keep it in your password
   manager.
2. Add a GitHub token in Settings. Type the owner (your username or an
   organisation) and press **Open GitHub**: GitHub's token form opens with
   these read-only permissions filled in:

   | Permission | Access | For |
   |---|---|---|
   | Contents | Read | default branch and its latest commit |
   | Issues | Read | issues |
   | Pull requests | Read | PRs and reviews |
   | Commit statuses | Read | CI from status-based integrations |
   | Checks | Read | CI from GitHub Actions and check-based apps |
   | Dependabot alerts | Read | alert counts |
   | Metadata | Read | always included |

   Choose **All repositories** (or the ones you want), check the form, and
   generate. Paste the token into Stillwater; it checks it with GitHub before
   saving.
3. **One token per owner.** A fine-grained token covers a single owner. If
   you work across your own repos and two organisations, add three tokens.
   Some organisations have to approve fine-grained tokens first; GitHub tells
   you when that's the case.
   A classic token with the `repo` scope covers everything at once, but it
   can also write to every repo you can. Prefer fine-grained.

## Connect Stillwater Monitor

1. In Stillwater Monitor, add your Stillwater address to `ALLOWED_ORIGINS` in
   `wrangler.jsonc` (for example `"https://stillwater.example.com"`) and deploy it.
2. If Stillwater Monitor is behind Cloudflare Access, add `/api/overview` to the
   bypass rule you made for `/api/heartbeat/*`. A page on another address
   can't carry your Access sign-in; Stillwater Monitor checks the token itself.
3. In Stillwater Monitor, open **Settings › API tokens** and make a token.
4. In Stillwater, open **Settings › Stillwater Monitor**, enter the monitor's
   address and the token, and press **Connect**. Running more than one
   monitor, say one per organisation? Connect each; their projects and
   problems are merged.

## Another browser, or a new laptop

Settings › **Download backup** saves your vault as a file. It is the
encrypted vault exactly as stored, so it opens only with your passphrase. On
the other browser, choose **Restore a backup** on the lock screen.

## Limits

- Up to 500 repos per token, and the 50 most recently updated open PRs and
  issues per repo. Stillwater says when a repo has more.
- It only refreshes while a tab is open: no notifications, no background
  sync. That's the cost of having no server.
- GitHub's API allows 5,000 points an hour per token. A refresh costs a few,
  and Settings shows what's left.

## Develop

```sh
npm install
npm run dev       # http://localhost:5173
npm test          # the vault's cryptography (Node 23.6 or later)
npm run check     # types
npm run preview   # the built site under wrangler, security headers included
```

Where things are:

- `src/lib/crypto.ts`: key derivation and encryption, with no storage in it
- `src/lib/vault.ts`: what is stored, and where
- `src/lib/github.ts`: the GraphQL queries
- `src/lib/monitor.ts`: the optional Stillwater Monitor connection
- `src/lib/attention.ts`: what goes under Needs attention and Waiting on you
- `src/lib/app.svelte.ts`: state, locking and refreshing
- `vite.config.ts`: the security headers, written to `dist/_headers`
