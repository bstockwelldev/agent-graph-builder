# Changesets

SDK releases are versioned with [Changesets](https://github.com/changesets/changesets).
A PR that changes `packages/agent-graph-sdk` adds a changeset:

```sh
pnpm changeset   # pick the bump (patch / minor / major) and write a summary
```

To release, run `pnpm changeset version` on a branch. It bumps the version and
generates the CHANGELOG entry from the pending changesets. Merge that, then run
the **Release SDK** workflow (Actions tab), which publishes to npm with
provenance and deploys the typedoc site. Studio is private and never versioned
here.
