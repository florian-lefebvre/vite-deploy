# @vite-deploy/internal-helpers

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
