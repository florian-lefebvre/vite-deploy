# @vite-deploy/internal-helpers

## 0.2.0

### Minor Changes

- [#33](https://github.com/web-runes/vite-deploy/pull/33) [`cd7c21a`](https://github.com/web-runes/vite-deploy/commit/cd7c21a3b3e5c9c4723bfdf88c880122b95beaa8) Thanks [@florian-lefebvre](https://github.com/florian-lefebvre)! - `onBuildDone()` on `createPrerenderPlugin` now accepts a client environment:

  ```js
  createPrerenderPlugin({
    onBuildDone({ clientEnvironment }) {},
  });
  ```

## 0.1.1

### Patch Changes

- [#24](https://github.com/web-runes/vite-deploy/pull/24) [`d920946`](https://github.com/web-runes/vite-deploy/commit/d92094603f49d343704451cad09b19fbf3e12f88) Thanks [@florian-lefebvre](https://github.com/florian-lefebvre)! - Improves build speed by skipping a useless build with `output: "hybrid"` when `prerender` is not provided

## 0.1.0

### Minor Changes

- [#15](https://github.com/web-runes/vite-deploy/pull/15) [`4bbb3c7`](https://github.com/web-runes/vite-deploy/commit/4bbb3c79fe1b615be9d96b117af732e81ab931f2) Thanks [@florian-lefebvre](https://github.com/florian-lefebvre)! - Exports new test related helpers from `@vite-deploy/internal-helpers/test`

- [#15](https://github.com/web-runes/vite-deploy/pull/15) [`4bbb3c7`](https://github.com/web-runes/vite-deploy/commit/4bbb3c79fe1b615be9d96b117af732e81ab931f2) Thanks [@florian-lefebvre](https://github.com/florian-lefebvre)! - `onBuildDone()` on `createPrerenderPlugin` is no longer passed a client environment

### Patch Changes

- [#15](https://github.com/web-runes/vite-deploy/pull/15) [`4bbb3c7`](https://github.com/web-runes/vite-deploy/commit/4bbb3c79fe1b615be9d96b117af732e81ab931f2) Thanks [@florian-lefebvre](https://github.com/florian-lefebvre)! - Fixes a case where `vite preview` would fail when using `output: "static"`

- [#15](https://github.com/web-runes/vite-deploy/pull/15) [`4bbb3c7`](https://github.com/web-runes/vite-deploy/commit/4bbb3c79fe1b615be9d96b117af732e81ab931f2) Thanks [@florian-lefebvre](https://github.com/florian-lefebvre)! - Fixes a case where logs would not respect Vite's `logLevel` option

- [#15](https://github.com/web-runes/vite-deploy/pull/15) [`4bbb3c7`](https://github.com/web-runes/vite-deploy/commit/4bbb3c79fe1b615be9d96b117af732e81ab931f2) Thanks [@florian-lefebvre](https://github.com/florian-lefebvre)! - Fixes a case where prerender temporary artifacts would not be cleaned with `output: "hybrid"`

- [#15](https://github.com/web-runes/vite-deploy/pull/15) [`4bbb3c7`](https://github.com/web-runes/vite-deploy/commit/4bbb3c79fe1b615be9d96b117af732e81ab931f2) Thanks [@florian-lefebvre](https://github.com/florian-lefebvre)! - Fixes a case where prerendering would fail if the Vite project was built programmatically from another directory

- [#15](https://github.com/web-runes/vite-deploy/pull/15) [`4bbb3c7`](https://github.com/web-runes/vite-deploy/commit/4bbb3c79fe1b615be9d96b117af732e81ab931f2) Thanks [@florian-lefebvre](https://github.com/florian-lefebvre)! - Fixes a case where dev and preview handlers conflicted with other Vite plugins. Vite Deploy now takes priority

- [#15](https://github.com/web-runes/vite-deploy/pull/15) [`4bbb3c7`](https://github.com/web-runes/vite-deploy/commit/4bbb3c79fe1b615be9d96b117af732e81ab931f2) Thanks [@florian-lefebvre](https://github.com/florian-lefebvre)! - Fixes a case where entrypoints would not be resolved

## 0.0.2

### Patch Changes

- [`fed7bfc`](https://github.com/web-runes/vite-deploy/commit/fed7bfc9dbc59fd464312acf15e121ba3d03261a) Thanks [@florian-lefebvre](https://github.com/florian-lefebvre)! - Test release

## 0.0.1

### Patch Changes

- [`d4fe4e8`](https://github.com/web-runes/vite-deploy/commit/d4fe4e85dcb849049479c82453d3db72eb8bb96d) Thanks [@florian-lefebvre](https://github.com/florian-lefebvre)! - Initial release
