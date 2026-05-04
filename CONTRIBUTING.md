# Contributor Manual

We welcome contributions of any size and skill level. As an open source project, we believe in giving back to our contributors and are happy to help with guidance on PRs, technical writing, and turning any feature idea into a reality.

> [!Tip]
>
> **For new contributors:** Take a look at [https://github.com/firstcontributions/first-contributions](https://github.com/firstcontributions/first-contributions) for helpful information on contributing

## Quick Guide

### Prerequisites

```shell
node: "^>=22.12.0"
pnpm: "^10.33.2"
# otherwise, your build will fail
```

We recommend using Corepack, [read PNPM docs](https://pnpm.io/installation#using-corepack).

### Setting up your local repo

Vite DEploy uses pnpm workspaces, so you should **always run `pnpm install` from the top-level project directory**. Running `pnpm install` in the top-level project root will install dependencies for every package in the repo.

```shell
git clone && cd ...
pnpm install
pnpm build
```

### Development

```shell
# starts a file-watching, live-reloading dev script for active development
pnpm packages dev
# build the entire project, one time.
pnpm build
```

**How can I test my changes while contributing to the repository?**

During the development process, you may want to test your changes to ensure they are working as expected. Here are a few ways to do it:

1. Run any of the examples in the `/examples` folder. They are linked to use the local pckages, so you can see the effects of your changes.

   ```shell
    pnpm --filter @example/cloudflare-static run dev
   ```

2. Write a test and run it. This is useful if you're making a specific fix and want to see if your changes are working as expected.

3. Create a separate project and use your local package through [`pnpm link`](https://pnpm.io/cli/link). This is helpful if you're making bigger changes and want to test them in a separate project.

Overall, it's up to personal preference which method to use. For smaller changes, using the examples folder may be sufficient. For larger changes, using a separate project may be more appropriate.

### Other useful commands

```shell
# auto-format the entire project
# (optional - a GitHub Action formats every commit after a PR is merged)
pnpm run format
```

```shell
# lint the project
# (optional - our linter creates helpful warnings, but not errors.)
pnpm run lint
```

### Making a Pull Request

When making a pull request, be sure to add a changeset when something has changed with Vite Deploy. Non-packages (`examples/*`) do not need changesets.

```shell
pnpm exec changeset
```
