# Rulesets

`master.json` protects `master`: changes arrive through a pull request, the CI `check` job must pass, and force pushes and deletion are blocked. Repository admins can bypass it, for example for docs-only commits.

The required check is the `check` job in `.github/workflows/ci.yml`. Rename one only together with the other.

Apply it once the `check` job has run on `master`, so GitHub knows the check name:

```bash
gh api --method POST repos/Patchalv/ping/rulesets --input .github/rulesets/master.json
```

To update it later, find its id and send the file again:

```bash
gh api repos/Patchalv/ping/rulesets --jq '.[] | select(.name == "master") | .id'
```

```bash
gh api --method PUT repos/Patchalv/ping/rulesets/<id> --input .github/rulesets/master.json
```
