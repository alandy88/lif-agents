# peter-3090-u — self-hosted Actions runner

The runner the kit's reusable agent workflow targets. This directory is
documentation only: the runner lives on a host, not in this repo, and there is
nothing here to install from.

> **Host verification status.** "Runner identity", "Host toolchain" and "Secret
> wiring" below are read out of this repo and are authoritative. "Installing the
> runner on the host" is the canonical GitHub procedure parameterised for this
> host — **unverified against the live machine**: no SSH key material for
> `peteryu@peter-3090-u` was available from the environment this was written in,
> so the actual runner directory, service unit name and installed tool versions
> were never read. Treat that section as the intended shape and correct it from
> the host next time someone has shell on it.

## Runner identity

| | |
|---|---|
| labels | `self-hosted`, `peter-3090-u`, `agent` |
| selected by | `runs-on: ${{ fromJSON(inputs.runs-on) }}` — [`.github/workflows/agent.yml`](../../.github/workflows/agent.yml) |
| passed as | `runs-on: '["self-hosted","peter-3090-u","agent"]'` from each consumer's `sandcastle-agent.yml` |

All three labels must be present on the runner: an array `runs-on` is an AND, so
a runner missing `agent` is never picked and the job queues indefinitely.

### Which workflows use it

`agent.yml` is the only one, and it does not hard-code the labels — it is
`on: workflow_call` and takes them as the required `runs-on` input. The label
array lives in the **consumer** repos' `sandcastle-agent.yml`, which call this
workflow by tag; the template for that caller is in the root
[README, "CI wiring"](../../README.md).

This repo's own workflows never touch the host: `ci.yml` and `release.yml` both
run on `ubuntu-latest`.

## Host toolchain

What `agent.yml` assumes is already installed on the host, outside the job:

| tool | why | where in `agent.yml` |
|---|---|---|
| `bun` | the `install-command` (`bun install`) and `runtime` (`bun`) input defaults; the input description says outright "the runner image ships bun, not npm" | those input defaults, and the `Run sandcastle-agent` step's `"$RUNTIME" "$ENTRYPOINT"` |
| `git` | checkout, plus the bot identity set with `git config` | `Configure bot git identity` step |
| `gh` (GitHub CLI) | the failure backstop comments on the issue with `gh issue comment` | `Failure backstop` step |
| `docker` | not used by the workflow directly, but the kit's default sandbox is `docker()`, and every agent session runs in a container built from the consumer's `.sandcastle/Dockerfile` | [`src/lib/provider-setup.mts`](../src/lib/provider-setup.mts), `createSandboxProvider` |

Node is *not* required — `bun` is both package manager and runtime. The provider
CLIs (`claude`, `codex`) are not host requirements either: they live inside the
consumer's sandbox image, which is where `providerPreflight()` smoke-checks them
with `<cli> --version`.

The runner's service account needs to reach the Docker daemon (`docker` group or
equivalent) and a writable image cache, since the first run for each consumer
repo builds `sandcastle:<repo-directory-name>`.

## Secret wiring

`agent.yml` declares four optional `workflow_call` secrets. Consumers pass them
with `secrets: inherit`, so each is in practice an **Actions secret on the
consumer repo** (or on the org, inherited by it). They are exposed to the runner
process only for the duration of the job, not configured persistently on the
host, and no value ever belongs in this repo.

| secret | required | what it does |
|---|---|---|
| `AGENT_PAT` | strongly recommended | The checkout token, and `GH_TOKEN` for both the agent step and the failure backstop. Falls back to `github.token`. The point of the PAT is that pushes and PRs made with `GITHUB_TOKEN` do not trigger further workflow runs, so without it the agent's PRs never get CI. Needs `repo` scope (classic), or contents + pull-requests + issues read/write (fine-grained) on the consumer repo. |
| `CLAUDE_CODE_OAUTH_TOKEN` | for Claude phases | Bare subscription token; the `claude` CLI reads it straight from the environment. |
| `OPENAI_API_KEY` | for Codex phases | Bare API key; the `codex` CLI reads it straight from the environment. |
| `CODEX_AUTH_JSON` | alternative to `OPENAI_API_KEY` | Contents of `~/.codex/auth.json` from `codex login`; the kit materialises it back to that path inside the sandbox. |

Which of these a run actually needs follows from the resolved profile:
`forwardedEnvKeys()` in [`src/lib/profiles.mts`](../src/lib/profiles.mts)
forwards only the providers the run touches, and the default `mixed` profile
touches both.

**Known gap.** The kit also honours `CLAUDE_CREDENTIALS_JSON` (the `claude
login` blob, the Claude-side twin of `CODEX_AUTH_JSON`), but `agent.yml` neither
declares nor exports it, so under Actions the only working Claude auth path is
`CLAUDE_CODE_OAUTH_TOKEN`. Closing that is a workflow change and out of scope
for this doc.

Rotation is a repo/org settings edit: these arrive per job as job environment
variables.

## Installing the runner on the host

Canonical procedure, parameterised for this host; **unverified against the live
machine** (see the note at the top). The generic steps stay in GitHub's docs:

- [Adding self-hosted runners](https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/adding-self-hosted-runners)
- [Configuring the runner application as a service](https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/configuring-the-self-hosted-runner-application-as-a-service)

The repo-specific parts are the name and the labels:

```bash
# On peteryu@peter-3090-u.
mkdir -p ~/actions-runner && cd ~/actions-runner
# Download, checksum and extract with the exact commands from the repo's
# Settings > Actions > Runners > New self-hosted runner page (linux-x64) —
# that page pins the current runner version for you.

./config.sh \
  --url https://github.com/<owner>/<repo> \
  --token <registration-token-from-that-page> \
  --name peter-3090-u \
  --labels peter-3090-u,agent \
  --unattended --replace
```

`self-hosted` is applied automatically; only the other two go in `--labels`. The
registration token is short-lived and single-use — not a secret to store.

Then run it as a systemd service so it survives reboot:

```bash
sudo ./svc.sh install    # unit: actions.runner.<owner>-<repo>.peter-3090-u.service
sudo ./svc.sh start
sudo ./svc.sh status
```

Verify from GitHub's side: the runner shows **Idle** with all three labels under
Settings > Actions > Runners.

### Registering for more than one repo

A runner registers against exactly one repo (or one org). Each additional
consumer repo needs either its own runner directory on this host
(`~/actions-runner-<repo>`, each with its own `svc.sh install` and service unit)
or a single **org-level** runner in a runner group the consumer repos may use.
Prefer the org-level runner as the consumer count grows: one install, one
service, one toolchain to keep current.

### Prerequisites to install once, before `config.sh`

`bun`, `git`, `gh` and `docker`, per "Host toolchain" above — installed for the
user the service runs as, and on that user's `PATH` *as systemd sees it*. A
`bun` reachable only from an interactive shell (exported in `~/.bashrc`) is the
classic cause of `bun: command not found` in a job that works fine over SSH.
Check with `sudo systemctl show -p Environment actions.runner.<...>.service`, or
by adding a `run: which bun git gh docker` step to a scratch workflow.

### Maintenance

- The runner self-updates its own application; the **toolchain does not**.
  `bun upgrade` and `gh`/`docker` updates are manual.
- Jobs run directly on the host as the service user, checked out under
  `~/actions-runner/_work`. Only trusted consumer repos should target these
  labels — anything that can dispatch this workflow gets code execution on the
  host. The free-text dispatch inputs (`profile`, `model`, and `issue`) are
  routed through environment variables instead of `${{ }}` interpolation, while
  `install-command` is a deliberate exception interpolated into a host-side
  `run:` script because it can only come from the consumer's committed workflow
  file, not dispatch free text; treat that caller-controlled command as trusted
  shell.
- Disk fills quietly: `_work` checkouts (`fetch-depth: 0`) plus the Docker image
  cache. Prune both periodically.

## Keep this directory small

Bun consumers install this repo from a git tag and receive the whole tree,
`files` in `package.json` notwithstanding. No binaries or runner tarballs here.
