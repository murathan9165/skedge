#!/bin/bash
#
# Runs the Fall 2026 course import on a schedule from a local machine, as a
# peer to .github/workflows/daily-course-import.yml. Either scheduler may win on
# a given day: whichever imports first commits, and the other sees identical
# section data, exits 3, and does nothing.
#
# Deliberately operates on its own clone under ~/.local/share rather than the
# working checkout, so a scheduled run can never commit, reset, or pull beneath
# someone mid-edit.
#
# Install with `npm run schedule:install` (see README). The installed copy at
# ~/.local/bin is what launchd runs; re-run the installer to pick up edits.

set -uo pipefail

REPO_URL="${SKEDGE_REPO_URL:-ssh://git@github.com/murathan9165/skedge.git}"
WORKDIR="${SKEDGE_IMPORT_DIR:-$HOME/.local/share/skedge-import}"
CLONE="$WORKDIR/skedge"
LOG="$WORKDIR/daily-import.log"
MAX_LOG_BYTES=1000000

mkdir -p "$WORKDIR"

# Keep the log from growing without bound across a term of daily runs.
if [ -f "$LOG" ] && [ "$(wc -c <"$LOG" | tr -d ' ')" -gt "$MAX_LOG_BYTES" ]; then
  tail -c 200000 "$LOG" > "$LOG.trimmed" && mv "$LOG.trimmed" "$LOG"
fi

log() { printf '%s  %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$LOG"; }

fail() {
  log "FAILED: $*"
  osascript -e "display notification \"$1\" with title \"Kenyon planner import failed\"" 2>/dev/null
  exit 1
}

log "--- run start ---"

if [ ! -d "$CLONE/.git" ]; then
  log "cloning $REPO_URL"
  git clone --quiet "$REPO_URL" "$CLONE" || fail "clone failed"
fi

cd "$CLONE" || fail "cannot enter $CLONE"

# Discard anything left by a previous run and match origin exactly. Safe here
# precisely because this clone is disposable and holds no human work.
git fetch --quiet origin main || fail "fetch failed"
git checkout --quiet -B main origin/main || fail "checkout failed"
git reset --hard --quiet origin/main || fail "reset failed"
git clean -qfd

# Reinstall only when the lockfile actually moved; npm ci is slow.
LOCK_STAMP="$WORKDIR/.package-lock.sha"
CURRENT_LOCK="$(shasum -a 256 package-lock.json | cut -d' ' -f1)"
if [ ! -d node_modules ] || [ "$(cat "$LOCK_STAMP" 2>/dev/null)" != "$CURRENT_LOCK" ]; then
  log "installing dependencies"
  npm ci --silent || fail "npm ci failed"
  printf '%s' "$CURRENT_LOCK" > "$LOCK_STAMP"
fi

SUMMARY="$WORKDIR/summary.json"
npx --no-install tsx scripts/courses/import-fall-2026.ts > "$SUMMARY" 2>>"$LOG"
CODE=$?

case "$CODE" in
  3)
    log "unchanged -- no commit"
    exit 0
    ;;
  0) ;;
  *)
    fail "import exited $CODE (see $LOG)"
    ;;
esac

log "changed: $(cat "$SUMMARY")"

# The commit is unreviewed and Vercel deploys it, so prove it builds first.
npm run build --silent >>"$LOG" 2>&1 || fail "build failed on refreshed data -- not committing"

MESSAGE="$(SUMMARY_PATH="$SUMMARY" node -e '
  const s = require(process.env.SUMMARY_PATH);
  const drift = s.delta === 0 ? "no section change" : `${s.delta > 0 ? "+" : ""}${s.delta} sections`;
  console.log(`data: refresh Fall 2026 snapshot (${s.sections} sections, ${drift})`);
')" || fail "could not build commit message"

git add src/data/fall-2026.json src/data/fall-2026.import-report.json

# The importer compares against the artifacts on disk, git against HEAD. The
# reset above keeps those in sync, so this should not fire -- but a no-op commit
# would otherwise abort the run and page someone over nothing.
if git diff --cached --quiet; then
  log "importer reported a change but the artifacts match HEAD -- nothing to commit"
  exit 0
fi

git -c user.name="skedge-import" \
    -c user.email="skedge-import@users.noreply.github.com" \
    commit --quiet -m "$MESSAGE" || fail "commit failed"

# The workflow may have pushed since the fetch above; rebase before pushing.
git pull --quiet --rebase origin main || fail "rebase onto origin/main failed"
git push --quiet origin HEAD:main || fail "push failed"

log "pushed: $MESSAGE"
exit 0
