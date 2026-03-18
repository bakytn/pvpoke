#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"

DEFAULT_CUP="all"
DEFAULT_PORT="${PVPOKE_PORT:-80}"
DEFAULT_BASE_URL="http://127.0.0.1:${DEFAULT_PORT}/pvpoke/src"
DEFAULT_TIMEOUT_MINUTES="45"
DEFAULT_TEAM_SIZE="6"
DEFAULT_TOP_N="3"
DEFAULT_SEARCH_DEPTH="deep"
DEFAULT_DUPLICATE_POLICY="type-diverse"
DEFAULT_LIKELY_THREAT_WEIGHT="2.0"

CUP="${DEFAULT_CUP}"
CP=""
FORMAT=""
BASE_URL="${PVPOKE_BASE_URL:-${DEFAULT_BASE_URL}}"
TIMEOUT_MINUTES="${DEFAULT_TIMEOUT_MINUTES}"
TEAM_SIZE="${DEFAULT_TEAM_SIZE}"
TOP_N="${DEFAULT_TOP_N}"
SEARCH_DEPTH="${DEFAULT_SEARCH_DEPTH}"
DUPLICATE_POLICY="${DEFAULT_DUPLICATE_POLICY}"
LIKELY_THREATS=""
LIKELY_THREAT_WEIGHT="${DEFAULT_LIKELY_THREAT_WEIGHT}"
BUILD_AROUND=""
EXCLUDE_SPECIES=""
JSON_OUTPUT=0
VERBOSE_OUTPUT=0
START_SERVER=1
USER_SET_CUP=0
USER_SET_CP=0
USER_SET_FORMAT=0
USER_SET_LIKELY_THREATS=0
USER_SET_LIKELY_THREAT_WEIGHT=0
USER_SET_BUILD_AROUND=0
USER_SET_EXCLUDE_SPECIES=0

usage() {
	cat <<EOF2
Usage: $(basename "$0") [options]

Generate top team recommendations from CLI using Team Builder scoring.

Options:
  --cup <slug>                    Cup slug (default: ${DEFAULT_CUP})
  --cp <value>                    League CP (optional with --cup; inferred when omitted)
  --format <slug>                 Format identifier (mutually exclusive with --cup/--cp)
  --size <count>                  Team size (default: ${DEFAULT_TEAM_SIZE})
  --top <count>                   Number of teams to return (default: ${DEFAULT_TOP_N})
  --search-depth <fast|medium|deep>
                                  Search profile (default: ${DEFAULT_SEARCH_DEPTH})
  --duplicate-policy <type-diverse|strict|any>
                                  Duplicate dex handling (default: ${DEFAULT_DUPLICATE_POLICY})
  --likely-threats <species_id_csv>
                                  Increase coverage emphasis on specific likely opponents
  --likely-threat-weight <number> Blend weight for likely threats (default: ${DEFAULT_LIKELY_THREAT_WEIGHT})
  --build-around <species_id_csv> Mandatory core species to include on every team
  --exclude-species <species_id_csv>
                                  Exclude species from generated team picks
  --verbose                       Detailed output (config, scores, grades, metrics)
  --json                          Output JSON
  --base-url <url>                Base URL where pvpoke/src is served (default: ${DEFAULT_BASE_URL})
  --timeout-min <min>             Timeout in minutes (default: ${DEFAULT_TIMEOUT_MINUTES})
  --no-server                     Do not auto-start Docker web server
  --help                          Show this help

Examples:
  $(basename "$0") --cup all --cp 1500
  $(basename "$0") --cup all --size 6 --top 3 --search-depth deep
  $(basename "$0") --format battlefrontiermasternewwf10 --duplicate-policy type-diverse
  $(basename "$0") --format battlefrontiermasternewwf10 --build-around meloetta_aria,heatran
  $(basename "$0") --format battlefrontiermasternewwf10 --exclude-species zygarde_complete
  $(basename "$0") --format battlefrontiermasternewwf10 --likely-threats meloetta_aria --likely-threat-weight 2.5
  $(basename "$0") --cup brujeria --cp 1500 --top 3 --verbose
  $(basename "$0") --cup all --cp 10000 --duplicate-policy any --json
EOF2
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
		--format)
			FORMAT="${2:-}"
			USER_SET_FORMAT=1
			shift 2
			;;
		--size)
			TEAM_SIZE="${2:-}"
			shift 2
			;;
		--top)
			TOP_N="${2:-}"
			shift 2
			;;
		--search-depth)
			SEARCH_DEPTH="${2:-}"
			shift 2
			;;
		--duplicate-policy)
			DUPLICATE_POLICY="${2:-}"
			shift 2
			;;
		--likely-threats)
			LIKELY_THREATS="${2:-}"
			USER_SET_LIKELY_THREATS=1
			shift 2
			;;
		--likely-threat-weight)
			LIKELY_THREAT_WEIGHT="${2:-}"
			USER_SET_LIKELY_THREAT_WEIGHT=1
			shift 2
			;;
		--build-around)
			BUILD_AROUND="${2:-}"
			USER_SET_BUILD_AROUND=1
			shift 2
			;;
		--exclude-species)
			EXCLUDE_SPECIES="${2:-}"
			USER_SET_EXCLUDE_SPECIES=1
			shift 2
			;;
		--json)
			JSON_OUTPUT=1
			shift
			;;
		--verbose)
			VERBOSE_OUTPUT=1
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
SEARCH_DEPTH="$(echo "${SEARCH_DEPTH}" | tr '[:upper:]' '[:lower:]')"
DUPLICATE_POLICY="$(echo "${DUPLICATE_POLICY}" | tr '[:upper:]' '[:lower:]')"

if [[ -z "${BASE_URL}" ]]; then
	echo "--base-url must be non-empty." >&2
	exit 1
fi

if [[ "${USER_SET_FORMAT}" -eq 1 && ( "${USER_SET_CUP}" -eq 1 || "${USER_SET_CP}" -eq 1 ) ]]; then
	echo "--format cannot be combined with --cup or --cp." >&2
	exit 1
fi

if [[ "${USER_SET_FORMAT}" -eq 1 && -z "${FORMAT}" ]]; then
	echo "--format must be non-empty." >&2
	exit 1
fi

if [[ "${USER_SET_FORMAT}" -eq 0 && -z "${CUP}" ]]; then
	echo "--cup must be non-empty when --format is not provided." >&2
	exit 1
fi

if [[ "${USER_SET_CP}" -eq 1 ]]; then
	if [[ ! "${CP}" =~ ^[0-9]+$ || "${CP}" -le 0 ]]; then
		echo "--cp must be a positive integer." >&2
		exit 1
	fi
fi

if [[ ! "${TEAM_SIZE}" =~ ^[0-9]+$ || "${TEAM_SIZE}" -le 0 ]]; then
	echo "--size must be a positive integer." >&2
	exit 1
fi

if [[ ! "${TOP_N}" =~ ^[0-9]+$ || "${TOP_N}" -le 0 ]]; then
	echo "--top must be a positive integer." >&2
	exit 1
fi

if [[ "${SEARCH_DEPTH}" != "fast" && "${SEARCH_DEPTH}" != "medium" && "${SEARCH_DEPTH}" != "deep" ]]; then
	echo "--search-depth must be one of: fast, medium, deep." >&2
	exit 1
fi

if [[ "${DUPLICATE_POLICY}" != "type-diverse" && "${DUPLICATE_POLICY}" != "strict" && "${DUPLICATE_POLICY}" != "any" ]]; then
	echo "--duplicate-policy must be one of: type-diverse, strict, any." >&2
	exit 1
fi

if [[ "${USER_SET_LIKELY_THREATS}" -eq 1 && -z "${LIKELY_THREATS//[[:space:],]/}" ]]; then
	echo "--likely-threats must include at least one species ID." >&2
	exit 1
fi

if [[ "${USER_SET_BUILD_AROUND}" -eq 1 && -z "${BUILD_AROUND//[[:space:],]/}" ]]; then
	echo "--build-around must include at least one species ID." >&2
	exit 1
fi

if [[ "${USER_SET_EXCLUDE_SPECIES}" -eq 1 && -z "${EXCLUDE_SPECIES//[[:space:],]/}" ]]; then
	echo "--exclude-species must include at least one species ID." >&2
	exit 1
fi

if [[ "${USER_SET_LIKELY_THREAT_WEIGHT}" -eq 1 ]]; then
	if ! awk -v v="${LIKELY_THREAT_WEIGHT}" 'BEGIN { exit !(v + 0 > 0) }'; then
		echo "--likely-threat-weight must be a positive number." >&2
		exit 1
	fi
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
		echo "Local server unavailable at ${BASE_URL}, starting Docker service..." >&2
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

echo "Ensuring Playwright Chromium is installed..." >&2
if [[ ! -f "${REPO_ROOT}/node_modules/playwright/package.json" ]]; then
	echo "Installing Node dependency: playwright" >&2
	npm install --no-save --prefix "${REPO_ROOT}" playwright@1.58.2 >&2
fi

"${REPO_ROOT}/node_modules/.bin/playwright" install chromium >&2

if [[ "${USER_SET_FORMAT}" -eq 1 ]]; then
	echo "Generating teams for format=${FORMAT} via ${BASE_URL}" >&2
else
	if [[ -n "${CP}" ]]; then
		echo "Generating teams for cup=${CUP}, cp=${CP} via ${BASE_URL}" >&2
	else
		echo "Generating teams for cup=${CUP}, cp=<auto> via ${BASE_URL}" >&2
	fi
fi

FORMAT="${FORMAT}" \
CUP="${CUP}" \
CP="${CP}" \
TEAM_SIZE="${TEAM_SIZE}" \
TOP_N="${TOP_N}" \
SEARCH_DEPTH="${SEARCH_DEPTH}" \
DUPLICATE_POLICY="${DUPLICATE_POLICY}" \
LIKELY_THREATS="${LIKELY_THREATS}" \
LIKELY_THREAT_WEIGHT="${LIKELY_THREAT_WEIGHT}" \
BUILD_AROUND="${BUILD_AROUND}" \
EXCLUDE_SPECIES="${EXCLUDE_SPECIES}" \
JSON_OUTPUT="${JSON_OUTPUT}" \
VERBOSE_OUTPUT="${VERBOSE_OUTPUT}" \
BASE_URL="${BASE_URL}" \
TIMEOUT_MINUTES="${TIMEOUT_MINUTES}" \
node "${SCRIPT_DIR}/generate-team.js"
