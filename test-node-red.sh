#!/usr/bin/env bash
# ==============================================================================
# test-node-red.sh
# Lancia Node-RED con il modulo postgrestor caricato localmente per test.
# Uso:  ./test-node-red.sh                  (riusa dir esistente + avvia)
#       ./test-node-red.sh --build           (ricostruisce TS + avvia)
#       ./test-node-red.sh --fresh           (pulisce e ricrea tutto)
#       ./test-node-red.sh --build --fresh   (build pulito da zero)
# ==============================================================================
set -euo pipefail

MODULE_DIR="$(cd "$(dirname "$0")" && pwd)"
TEST_DIR="${HOME}/.node-red-test-postgrestor"
PORT="${NR_PORT:-1880}"

echo "========================================="
echo " Modulo: ${MODULE_DIR}"
echo " Test dir: ${TEST_DIR}"
echo " Porta: ${PORT}"
echo "========================================="

# --- parse flags ---
DO_BUILD=false
DO_FRESH=false

for arg in "$@"; do
  case "$arg" in
    --build) DO_BUILD=true ;;
    --fresh) DO_FRESH=true ;;
  esac
done

# --- build opzionale ---
if $DO_BUILD; then
  echo "[build] Ricostruzione TypeScript..."
  cd "${MODULE_DIR}"
  npm run build
  echo "  -> Build completata."
fi

# --- prepara dir di test (solo se --fresh) ---
if $DO_FRESH; then
  echo "[init] Preparazione dir di test da zero..."
  rm -rf "${TEST_DIR}"
  mkdir -p "${TEST_DIR}"

  cat > "${TEST_DIR}/package.json" <<PKGJSON
{
  "name": "node-red-test-postgrestor",
  "version": "0.0.1",
  "private": true,
  "dependencies": {
    "node-red": "^5.0.0",
    "@topcs/node-red-contrib-postgres": "file:${MODULE_DIR}"
  }
}
PKGJSON

  echo "  -> package.json creato."
elif [[ ! -d "${TEST_DIR}" ]]; then
  echo "[init] Dir di test non trovata — inizializzo..."
  mkdir -p "${TEST_DIR}"

  cat > "${TEST_DIR}/package.json" <<PKGJSON
{
  "name": "node-red-test-postgrestor",
  "version": "0.0.1",
  "private": true,
  "dependencies": {
    "node-red": "^5.0.0",
    "@topcs/node-red-contrib-postgres": "file:${MODULE_DIR}"
  }
}
PKGJSON

  echo "  -> package.json creato."
else
  echo "[init] Riuso dir di test esistente (flows.json preservato)."
fi

# --- install (se necessario) ---
if [[ ! -d "${TEST_DIR}/node_modules" ]]; then
  echo "[install] npm install..."
  cd "${TEST_DIR}"
  npm install --no-audit --no-fund 2>&1 | tail -5
  echo "  -> npm install completato."
else
  echo "[install] node_modules già presente, salto npm install."
fi

# --- avvia Node-RED ---
echo "[start] Avvio Node-RED sulla porta ${PORT}..."
echo ""
echo "  Apri il browser su:  http://localhost:${PORT}/"
echo "  Ctrl+C per fermarlo."
echo "========================================="

cd "${TEST_DIR}"
npx node-red --userDir "${TEST_DIR}" --port "${PORT}"
