Default prompt templates ship here and are resolved in place via `templatePath()`
(PRD decision D1(b)) — they are **not** copied into consuming repos.

P1 populates `implement/` from `comfyui-lif-nodes/.sandcastle/templates/implement/`.
A repo overrides a template by placing a same-named file under its own
`templateDir` and passing `overrideDir` to `templatePath()`.
