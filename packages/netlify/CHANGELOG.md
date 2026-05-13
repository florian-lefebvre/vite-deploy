# @vite-deploy/netlify

## 0.2.0

### Minor Changes

- [#33](https://github.com/web-runes/vite-deploy/pull/33) [`cd7c21a`](https://github.com/web-runes/vite-deploy/commit/cd7c21a3b3e5c9c4723bfdf88c880122b95beaa8) Thanks [@florian-lefebvre](https://github.com/florian-lefebvre)! - Adds automatic caching for static assets stored under `build.assetsDir`

### Patch Changes

- Updated dependencies [[`cd7c21a`](https://github.com/web-runes/vite-deploy/commit/cd7c21a3b3e5c9c4723bfdf88c880122b95beaa8)]:
  - @vite-deploy/internal-helpers@0.2.0

## 0.1.0

### Minor Changes

- [#28](https://github.com/web-runes/vite-deploy/pull/28) [`6557834`](https://github.com/web-runes/vite-deploy/commit/65578347653450bc1bed6f59200e1d0d7187bf71) Thanks [@florian-lefebvre](https://github.com/florian-lefebvre)! - Implements remaining context properties

  Until now, accessing `cookies`, `next`, `params` or `rewrite` on the `context` would throw with error `Not implemented`. Now:

  - `cookies` and `params` are implemented
  - `next` and `rewrite` throw a more helpful error

### Patch Changes

- [#30](https://github.com/web-runes/vite-deploy/pull/30) [`fabc858`](https://github.com/web-runes/vite-deploy/commit/fabc85802e8db7a2e05185f37f71743fe46b4f68) Thanks [@florian-lefebvre](https://github.com/florian-lefebvre)! - Updates how requests and responses are converted internally

## 0.0.3

### Patch Changes

- [#15](https://github.com/web-runes/vite-deploy/pull/15) [`4bbb3c7`](https://github.com/web-runes/vite-deploy/commit/4bbb3c79fe1b615be9d96b117af732e81ab931f2) Thanks [@florian-lefebvre](https://github.com/florian-lefebvre)! - Fixes a case where entrypoints would not be resolved

- Updated dependencies [[`4bbb3c7`](https://github.com/web-runes/vite-deploy/commit/4bbb3c79fe1b615be9d96b117af732e81ab931f2), [`4bbb3c7`](https://github.com/web-runes/vite-deploy/commit/4bbb3c79fe1b615be9d96b117af732e81ab931f2), [`4bbb3c7`](https://github.com/web-runes/vite-deploy/commit/4bbb3c79fe1b615be9d96b117af732e81ab931f2), [`4bbb3c7`](https://github.com/web-runes/vite-deploy/commit/4bbb3c79fe1b615be9d96b117af732e81ab931f2), [`4bbb3c7`](https://github.com/web-runes/vite-deploy/commit/4bbb3c79fe1b615be9d96b117af732e81ab931f2), [`4bbb3c7`](https://github.com/web-runes/vite-deploy/commit/4bbb3c79fe1b615be9d96b117af732e81ab931f2), [`4bbb3c7`](https://github.com/web-runes/vite-deploy/commit/4bbb3c79fe1b615be9d96b117af732e81ab931f2), [`4bbb3c7`](https://github.com/web-runes/vite-deploy/commit/4bbb3c79fe1b615be9d96b117af732e81ab931f2)]:
  - @vite-deploy/internal-helpers@0.1.0

## 0.0.2

### Patch Changes

- [`fed7bfc`](https://github.com/web-runes/vite-deploy/commit/fed7bfc9dbc59fd464312acf15e121ba3d03261a) Thanks [@florian-lefebvre](https://github.com/florian-lefebvre)! - Test release

- Updated dependencies [[`fed7bfc`](https://github.com/web-runes/vite-deploy/commit/fed7bfc9dbc59fd464312acf15e121ba3d03261a)]:
  - @vite-deploy/internal-helpers@0.0.2

## 0.0.1

### Patch Changes

- [`d4fe4e8`](https://github.com/web-runes/vite-deploy/commit/d4fe4e85dcb849049479c82453d3db72eb8bb96d) Thanks [@florian-lefebvre](https://github.com/florian-lefebvre)! - Initial release

- Updated dependencies [[`d4fe4e8`](https://github.com/web-runes/vite-deploy/commit/d4fe4e85dcb849049479c82453d3db72eb8bb96d)]:
  - @vite-deploy/internal-helpers@0.0.1
