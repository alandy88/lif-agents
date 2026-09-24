# Sizing rubric — T-shirt + ~100k-token budget

The goal: **every Linear ticket must be implementable within ~100k tokens of context**
(one focused agent or Claude Code session, with headroom for tool output). Size is what
decides whether a picked doc becomes one card or several.

## T-shirt sizes (estimated implementation-context tokens)

| Size | Budget        | Typical shape                                                      |
| ---- | ------------- | ------------------------------------------------------------------ |
| S    | ≤ ~30k        | One file/module, a config change, a doc, a single well-scoped fix  |
| M    | ~30k–70k      | A feature touching a few files with tests; one clear vertical slice |
| L    | ~70k–100k     | A larger slice near the budget ceiling; review the estimate twice  |
| XL   | > 100k        | MUST be split — does not fit one ticket                            |

## Estimating

Read the doc in full and weigh:
- **Surface area** — how many files/modules/systems the work realistically touches.
- **Unknowns** — exploration the implementer must do (raises the estimate).
- **Existing-code reading** — context the agent must load before editing counts toward
  the budget, not just new code written.
- **Tests** — test authoring and runs consume context too.

State the estimate as `<size> (~Nk)` with a one-line justification. When uncertain
between two sizes, pick the larger.

## Splitting XL docs

Split along **vertical slices** (use `to-issues` logic): each child cuts end-to-end
through its layers and is independently demoable/verifiable. Re-estimate each child;
recurse until every child is ≤ L (≤ ~100k). Note blocking order between children.
Prefer several thin slices over one borderline-XL ticket.
