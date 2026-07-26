Default prompt templates ship here and are resolved in place via `templatePath()`
(PRD decision D1(b)) — they are **not** copied into consuming repos.

`implement/` came from `comfyui-lif-nodes/.sandcastle/templates/implement/`;
`task/` from `Morrow/.sandcastle/templates/`. Both were made repo-agnostic the
same way: the toolchain-specific commands collapsed into the injected
`{{CONVENTIONS}}` and `{{VERIFY}}` arguments the kit owns.

A repo overrides a template by placing a same-named file under its own
`templateDir` and passing `overrideDir` to `templatePath()`.
