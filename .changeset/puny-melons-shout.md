---
"@vite-deploy/netlify": minor
---

Implements remaining context properties

Until now, accessing `cookies`, `next`, `params` or `rewrite` on the `context` would throw with error `Not implemented`. Now:

- `cookies` and `params` are implemented
- `next` and `rewrite` throw a more helpful error
