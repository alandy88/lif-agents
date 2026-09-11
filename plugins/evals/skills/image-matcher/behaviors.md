# image-matcher — Expected Behaviors

## matching [first-response scope]

- MUST reference the venv-based Python invocation path
- MUST describe the correct matching approach (perceptual hashing / pHash)
- MUST mention the picked_images output folder

## no-match case [first-response scope]

- MUST handle gracefully without erroring
- MUST NOT fabricate matches

## LLM Judge Guidance

For `describes_phash_approach`: look for "perceptual hash", "pHash", "imagehash",
or "hamming distance". Failure if the response describes pixel comparison or
a non-hashing approach.

