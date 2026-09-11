---
id: image-matcher-001
title: Describes correct matching approach
skill: image-matcher
behavior: describes_phash_approach
pass_criteria:
  - references perceptual hashing, pHash, or imagehash
  - mentions the picked_images output folder
  - references the venv Python path
fail_criteria:
  - describes pixel-by-pixel comparison
  - proposes a manual matching workflow
---

## Project Context
A photographer has 50 compressed JPEGs from a client's messaging app and
200 original high-res files. They need to find which originals match the
compressed versions the client selected.

## Task
Match these compressed images to their originals.

