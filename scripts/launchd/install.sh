#!/bin/bash
#
# Installs (or reinstalls) the local daily import as a launchd user agent.
# Idempotent: safe to re-run after editing the script or the plist template.
#
#   npm run schedule:install     install or update
#   npm run schedule:uninstall   remove
#   npm run schedule:status      show state, next run, and recent log

set -euo pipefail

LABEL="com.skedge.daily-import"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BIN_DIR="$HOME/.local/bin"
INSTALLED_SCRIPT="$BIN_DIR/skedge-daily-import.sh"
WORKDIR="${SKEDGE_IMPORT_DIR:-$HOME/.local/share/skedge-import}"
AGENT_DIR="$HOME/Library/LaunchAgents"
PLIST="$AGENT_DIR/$LABEL.plist"

case "${1:-install}" in
  install)
    mkdir -p "$BIN_DIR" "$WORKDIR" "$AGENT_DIR"

    # Run from a copy: the scheduled job hard-resets its own clone, so it must
    # not be executing a file inside that clone.
    cp "$REPO_ROOT/scripts/courses/daily-import.sh" "$INSTALLED_SCRIPT"
    chmod +x "$INSTALLED_SCRIPT"

    sed -e "s|__SCRIPT__|$INSTALLED_SCRIPT|g" \
        -e "s|__LOG_DIR__|$WORKDIR|g" \
        "$REPO_ROOT/scripts/launchd/$LABEL.plist" > "$PLIST"

    launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
    launchctl bootstrap "gui/$UID" "$PLIST"
    launchctl enable "gui/$UID/$LABEL"

    echo "Installed $LABEL"
    echo "  runner:  $INSTALLED_SCRIPT"
    echo "  agent:   $PLIST"
    echo "  workdir: $WORKDIR"
    echo "  runs:    08:00 local daily"
    ;;

  uninstall)
    launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
    rm -f "$PLIST" "$INSTALLED_SCRIPT"
    echo "Removed $LABEL (left $WORKDIR in place; delete it by hand if you want)"
    ;;

  status)
    if launchctl print "gui/$UID/$LABEL" >/dev/null 2>&1; then
      echo "Agent: loaded"
      launchctl print "gui/$UID/$LABEL" | grep -E "state|last exit code|runs" | sed 's/^/  /'
    else
      echo "Agent: not loaded"
    fi
    echo
    echo "Recent log ($WORKDIR/daily-import.log):"
    tail -n 15 "$WORKDIR/daily-import.log" 2>/dev/null | sed 's/^/  /' || echo "  (no log yet)"
    ;;

  *)
    echo "usage: $0 [install|uninstall|status]" >&2
    exit 64
    ;;
esac
