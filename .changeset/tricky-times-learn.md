---
"@vite-deploy/internal-helpers": minor
---

`onBuildDone()` on `createPrerenderPlugin` now accepts a client environment:

```js
createPrerenderPlugin({
    onBuildDone({ clientEnvironment }) {}
})
```
