# lif-hub moved to lif-workbench

The hub implementation, profiles, tests, CLI, and full React bench now live in
`lif-workbench`:

- `apps/workbench-lite/wb/hub/` — routing and launch domain logic
- `apps/workbench-lite/hub-profiles.json` — modes and agent defaults
- `apps/workbench-lite/web/src/benches/hub/` — `http://127.0.0.1:8765/#/hub`
- `apps/lif-cli/src/lif_cli/hub/` — `lif-cli hub`

`local/bin/lif-hub` is a one-release compatibility shim. The Orca side panel remains at
`local/orca-plugins/lif-hub/` because it is an Orca plugin; it calls the workbench service
directly.
