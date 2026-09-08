# Repository workflow

Every tracked change must be made on a topic branch created from a clean, current `main` branch.

- Never commit directly to `main`.
- Commit and push only the topic branch.
- Open a pull request targeting `main` and include the verification performed.
- Never merge the pull request; the repository owner makes the final merge decision.
- Never force-push.
- Do not commit generated installers, archives, or other `dist/` artifacts unless the existing release policy explicitly requires them.

