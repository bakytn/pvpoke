#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"

DEFAULT_CUP="all"
DEFAULT_CP="10000"
DEFAULT_PORT="${PVPOKE_PORT:-80}"
DEFAULT_BASE_URL="http://127.0.0.1:${DEFAULT_PORT}/pvpoke/src"
DEFAULT_TIMEOUT_MINUTES="45"

CUP="${DEFAULT_CUP}"
CP="${DEFAULT_CP}"
BASE_URL="${PVPOKE_BASE_URL:-${DEFAULT_BASE_URL}}"
TIMEOUT_MINUTES="${DEFAULT_TIMEOUT_MINUTES}"
START_SERVER=1
GENERATE_ALL=0
USER_SET_CUP=0
USER_SET_CP=0

usage() {
	cat <<EOF
Usage: $(basename "$0") [options]

Regenerate rankings from CLI by driving ranker.php and rankersandbox.php headlessly.

Options:
  --cup <slug>          Cup slug (default: ${DEFAULT_CUP})
  --cp <value>          League CP (default: ${DEFAULT_CP})
  --all                 Generate all available cup/league combinations
  --base-url <url>      Base URL where pvpoke/src is served (default: ${DEFAULT_BASE_URL})
  --timeout-min <min>   Stage timeout in minutes (default: ${DEFAULT_TIMEOUT_MINUTES})
  --no-server           Do not auto-start Docker web server
  --help                Show this help

Examples:
  $(basename "$0")
  $(basename "$0") --cup all --cp 10000
  $(basename "$0") --all
  $(basename "$0") --base-url http://127.0.0.1:8080/pvpoke/src --no-server
EOF
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		--cup)
			CUP="${2:-}"
			USER_SET_CUP=1
			shift 2
			;;
		--cp)
			CP="${2:-}"
			USER_SET_CP=1
			shift 2
			;;
		--all)
			GENERATE_ALL=1
			shift
			;;
		--base-url)
			BASE_URL="${2:-}"
			shift 2
			;;
		--timeout-min)
			TIMEOUT_MINUTES="${2:-}"
			shift 2
			;;
		--no-server)
			START_SERVER=0
			shift
			;;
		--help|-h)
			usage
			exit 0
			;;
		*)
			echo "Unknown option: $1" >&2
			usage >&2
			exit 1
			;;
	esac
done

BASE_URL="${BASE_URL%/}"

if [[ -z "${BASE_URL}" ]]; then
	echo "base-url must be non-empty." >&2
	exit 1
fi

if [[ "${GENERATE_ALL}" -eq 1 && ( "${USER_SET_CUP}" -eq 1 || "${USER_SET_CP}" -eq 1 ) ]]; then
	echo "--all cannot be combined with --cup or --cp." >&2
	exit 1
fi

if [[ "${GENERATE_ALL}" -eq 0 && ( -z "${CUP}" || -z "${CP}" ) ]]; then
	echo "cup, cp, and base-url must be non-empty." >&2
	exit 1
fi

if [[ ! "${TIMEOUT_MINUTES}" =~ ^[0-9]+$ || "${TIMEOUT_MINUTES}" -le 0 ]]; then
	echo "--timeout-min must be a positive integer." >&2
	exit 1
fi

check_server() {
	curl -fsS "${BASE_URL}/data/version.php" >/dev/null 2>&1
}

if [[ "${START_SERVER}" -eq 1 ]]; then
	if ! check_server; then
		echo "Local server unavailable at ${BASE_URL}, starting Docker service..."
		docker compose -f "${REPO_ROOT}/docker/docker-compose.yml" up -d --build

		for _ in {1..45}; do
			if check_server; then
				break
			fi
			sleep 2
		done

		if ! check_server; then
			echo "Server did not become ready at ${BASE_URL}" >&2
			exit 1
		fi
	fi
else
	if ! check_server; then
		echo "Server unavailable at ${BASE_URL}. Start it first or omit --no-server." >&2
		exit 1
	fi
fi

echo "Ensuring Playwright Chromium is installed..."
if [[ ! -f "${REPO_ROOT}/node_modules/playwright/package.json" ]]; then
	echo "Installing Node dependency: playwright"
	npm install --no-save --prefix "${REPO_ROOT}" playwright@1.58.2
fi

"${REPO_ROOT}/node_modules/.bin/playwright" install chromium

if [[ "${GENERATE_ALL}" -eq 1 ]]; then
	echo "Generating rankings for all existing cups/leagues via ${BASE_URL}"
else
	echo "Generating rankings for cup=${CUP}, cp=${CP} via ${BASE_URL}"
fi

CUP="${CUP}" \
CP="${CP}" \
BASE_URL="${BASE_URL}" \
TIMEOUT_MINUTES="${TIMEOUT_MINUTES}" \
GENERATE_ALL="${GENERATE_ALL}" \
node "${SCRIPT_DIR}/regenerate-rankings.js"

echo "Ranking regeneration completed."
