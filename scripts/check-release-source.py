"""Require successful GitHub Actions evidence for the exact Android source commit."""
import json
import os
import re
import subprocess
import urllib.request


REQUIRED = {"Quality gate", "Mobile quality", "Android emulator E2E"}


def require_checks(checks, sha):
    # Only the GitHub Actions app can supply these checks. Ignore older reruns.
    latest = {}
    for check in checks:
        if check.get("head_sha") != sha or check.get("app", {}).get("slug") != "github-actions":
            continue
        name = check["name"]
        if name not in latest or check["id"] > latest[name]["id"]:
            latest[name] = check
    missing = REQUIRED - latest.keys()
    failed = [name for name in REQUIRED & latest.keys()
              if latest[name].get("status") != "completed"
              or latest[name].get("conclusion") != "success"]
    if missing or failed:
        raise ValueError("Release checks missing or not successful: " + ", ".join(sorted(missing | set(failed))))
    return {name: latest[name]["id"] for name in sorted(REQUIRED)}


def main():
    sha = os.environ["GITHUB_SHA"]
    repo = os.environ["GITHUB_REPOSITORY"]
    if not re.fullmatch(r"[0-9a-f]{40}", sha) or not re.fullmatch(r"[\w.-]+/[\w.-]+", repo):
        raise SystemExit("Invalid source identity")
    subprocess.run(["git", "fetch", "origin", "main"], check=True)
    subprocess.run(["git", "merge-base", "--is-ancestor", sha, "origin/main"], check=True)
    checks = []
    for page in range(1, 21):
        request = urllib.request.Request(
            f"https://api.github.com/repos/{repo}/commits/{sha}/check-runs?per_page=100&page={page}",
            headers={"Authorization": "Bearer " + os.environ["GH_TOKEN"],
                     "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"},
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            batch = json.load(response)["check_runs"]
        checks.extend(batch)
        if len(batch) < 100:
            break
    else:
        raise SystemExit("Too many check runs; refusing incomplete evidence")
    print(json.dumps({"sourceSha": sha, "checks": require_checks(checks, sha)}, indent=2))


if __name__ == "__main__":
    main()
