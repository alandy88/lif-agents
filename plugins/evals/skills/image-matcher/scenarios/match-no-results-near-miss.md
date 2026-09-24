---
id: image-matcher-002
title: No matching images handled gracefully
skill: image-matcher
behavior: handles_no_matches_gracefully
pass_criteria:
  - acknowledges the possibility of no matches
  - suggests adjusting threshold or checking inputs
fail_criteria:
  - fabricates match results
  - errors out or refuses to proceed
---

## Project Context
A photographer ran the matcher but got zero matches. The compressed folder
has screenshots from Twitter, not actual client picks. The originals folder
has portrait photos.

## Task
I ran the image matcher but got zero matches. What should I do?

