# Factory hub: one dashboard for every project on the machine

Status: draft. Nothing is built. Open: D1, D2, D3 below.

## Today

Each project has its own factory folder beside it, `<repo>/../<name>-factory`, with its
own `dashboard.html` and `jobs/`. Each is watched by its own
`python3 -m http.server --bind 127.0.0.1`, so two projects need two ports.

State on this machine, 2026-10-11, all under `/home/peteryu/github/personal`:

| Factory folder | Jobs | State |
| --- | --- | --- |
| `lif-agents-factory` | 4 | all `merged` |
| `lif-workbench-factory` | 5 | 4 `merged`, `005-studio-upscale-workflow` at `pr-open` |
| `comfyui-lif-nodes-factory` | 1 | `merged` |

No factory server was running.

## Design

One hub folder holds a symlink to each factory folder and one new `index.html`. One
server serves the hub on one fixed port.

```
factory-hub/
  index.html                     new home page
  lif-agents-factory         ->  the real folder
  lif-workbench-factory      ->  the real folder
  comfyui-lif-nodes-factory  ->  the real folder

cd factory-hub && python3 -m http.server 8700 --bind 127.0.0.1

http://127.0.0.1:8700/                                       home page
http://127.0.0.1:8700/lif-workbench-factory/dashboard.html   that board, unchanged
```

The per-project boards work unchanged under the hub: `dashboard.html` fetches `jobs/`
relative to its own URL, and reads each link's `href`, not its text. Tested on
2026-10-11 with two symlinked factories on one port: the directory index listed both
(`href="lif-agents-factory/"`, shown as `lif-agents-factory@`) and a `job.json` was
served through the symlink.

### The home page

`index.html` reads the hub's own directory index, keeps every entry ending
`-factory/`, and for each one reads `<name>-factory/jobs/*/job.json`. It shows one row
per project with job counts by stage and a link to that project's board. Projects with
a `needs-human` job sort first. It polls every 2 seconds, as the boards do.

```
project            running  your call  PR open  merged
lif-workbench         0         0         1        4    open board
lif-agents            0         0         0        4    open board
comfyui-lif-nodes     0         0         0        1    open board
```

`running` is the stages `spec`, `build`, `review`, `approve`. `your call` is
`needs-human`.

## Findings

- **Never serve `personal/` itself to get discovery for free.** It holds 2 `.env`
  files, and `--bind 127.0.0.1` does not stop a page open in the browser from asking
  for them. The hub folder of symlinks is the boundary. Worktrees are already served by
  each factory today; that is unchanged.
- **Board copies drift.** Bootstrap step 2 copies `dashboard.html` only when absent, so
  skill updates never reach an existing factory. `lif-workbench-factory/dashboard.html`
  is an older copy: 12 lines differ from the skill's asset. This plan does not fix
  that. The hub could later serve one shared copy in place of one per project.

## Open decisions

- **D1. What the one page is.** Suggested: the home page above. One new file, nothing
  existing changes. Alternative: one merged board showing every project's jobs, by
  giving the skill's `dashboard.html` a project prefix on each `jobs/` fetch and a
  project tag on each card. That changes the skill asset, and would also fix the drift.
- **D2. Who adds each symlink.** Suggested: Bootstrap step 2 of the `factory` skill
  runs `ln -sfn <factory> <hub>/<name>-factory`. Alternative: by hand, once per project.
- **D3. Where the hub lives.** Suggested: `~/factory-hub`, so projects outside
  `personal/` can join. Alternative: a sibling folder in `personal/`.

Also unset: the port (`8700` is a suggestion, so the address never changes), and
whether the server is started by hand or kept running as a user service, as
`workbench-lite.service` is.

## Known limit

Two projects with the same folder name in different parents would want the same
symlink name.
