# remote/runner/

Provisioning for the self-hosted GitHub Actions runner the kit's reusable
workflow targets — `runs-on: ["self-hosted", "peter-3090-u", "agent"]` in
`.github/workflows/agent.yml`.

Scaffold only. Nothing here yet; the runner is still a snowflake. The intended
contents, per the consolidation design:

- runner install, label, and service setup
- the host toolchain the workflows assume (bun, per `agent.yml`)
- how `AGENT_PAT` and the agent OAuth token secrets are wired

Documenting and scripting that is a separate follow-up task.

Keep large binaries out of this directory: bun consumers install this repo from
a git tag and receive the whole tree, `files` in `package.json`
notwithstanding.
