# clean — Expected Behaviors

## recursive mode [first-response scope]

- MUST select recursive mode when given a folder with subfolders
- MUST mention the timestamped output folder naming convention
- MUST produce a concrete command with correct flags

## single mode [first-response scope]

- MUST select single mode for a single folder
- MUST NOT apply recursive scanning when not needed

## LLM Judge Guidance

For `selects_recursive_mode`: look for `--mode recursive` or `recursive` mode
selection. Failure if the response defaults to single without addressing subfolders.

For `selects_single_mode`: look for `--mode single` or absence of recursive
flags. Failure if the response applies recursive scanning unnecessarily.

