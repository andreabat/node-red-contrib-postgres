#!/usr/bin/env bash
# ==============================================================================
# test-node-red.sh
# Lancia Node-RED con il modulo postgrestor caricato localmente per test,
# con un PostgreSQL Docker locale + database dvdrental opzionale.
# Uso:  ./test-node-red.sh                  (riusa dir esistente + avvia)
#       ./test-node-red.sh --build           (ricostruisce TS + avvia)
#       ./test-node-red.sh --fresh           (pulisce e ricrea tutto)
#       ./test-node-red.sh --build --fresh   (build pulito da zero)
#       ./test-node-red.sh --pg              (avvia anche PostgreSQL Docker)
# ==============================================================================
set -euo pipefail

MODULE_DIR="$(cd "$(dirname "$0")" && pwd)"
TEST_DIR="${HOME}/.node-red-test-postgrestor"
PORT="${NR_PORT:-1880}"
PG_CONTAINER="postgrestor-pg"
PG_PORT="${PG_PORT:-5432}"
PG_USER="postgrestor"
PG_PASSWORD="postgrestor"
PG_DB="dvdrental"
DVD_DUMP="${DVD_DUMP:-${HOME}/Downloads/dvdrental.tar}"

echo "========================================="
echo " Modulo: ${MODULE_DIR}"
echo " Test dir: ${TEST_DIR}"
echo " Porta: ${PORT}"
echo "========================================="

# --- parse flags ---
DO_BUILD=false
DO_FRESH=false
DO_PG=false

for arg in "$@"; do
  case "$arg" in
    --build) DO_BUILD=true ;;
    --fresh) DO_FRESH=true ;;
    --pg)    DO_PG=true ;;
  esac
done

# --- build opzionale ---
if $DO_BUILD; then
  echo "[build] Ricostruzione TypeScript..."
  cd "${MODULE_DIR}"
  npm run build
  echo "  -> Build completata."
fi

# --- PostgreSQL Docker (opzionale) ---
if $DO_PG; then
  echo "[pg] Avvio PostgreSQL Docker..."

  # Stop e rimuovi container se esiste già
  docker rm -f "${PG_CONTAINER}" 2>/dev/null || true

  # Crea volume per persistenza dati
  docker volume create pgdata-postgrestor 2>/dev/null || true

  docker run -d \
    --name "${PG_CONTAINER}" \
    -e POSTGRES_USER="${PG_USER}" \
    -e POSTGRES_PASSWORD="${PG_PASSWORD}" \
    -e POSTGRES_DB="${PG_DB}" \
    -p "${PG_PORT}:5432" \
    -v pgdata-postgrestor:/var/lib/postgresql/data \
    postgres:16-alpine

  echo "  -> PostgreSQL avviato su localhost:${PG_PORT}"
  echo "  -> Utente: ${PG_USER} / Password: ${PG_PASSWORD} / DB: ${PG_DB}"

  # Aspetta che PostgreSQL sia pronto
  echo "  -> Attendo PostgreSQL..."
  until docker exec "${PG_CONTAINER}" pg_isready -U "${PG_USER}" 2>/dev/null; do
    sleep 1
  done
  echo "  -> PostgreSQL pronto."

  # Carica il dump dvdrental se non ancora caricato
  if [ -f "${DVD_DUMP}" ]; then
    LOADED_MARKER="${TEST_DIR}/.dvdrental_loaded"
    if [ -f "${LOADED_MARKER}" ]; then
      echo "  -> Database dvdrental già caricato (usa --fresh --pg per ricaricare)."
    else
      echo "  -> Caricamento dvdrental da ${DVD_DUMP}..."
      mkdir -p /tmp/dvdrental_extract
      rm -rf /tmp/dvdrental_extract/*
      tar xf "${DVD_DUMP}" -C /tmp/dvdrental_extract
      docker cp /tmp/dvdrental_extract/. "${PG_CONTAINER}:/tmp/dump/"
      docker exec "${PG_CONTAINER}" pg_restore -U "${PG_USER}" -d "${PG_DB}" -c --if-exists --no-owner --no-privileges /tmp/dump/ 2>&1 | tail -5
      mkdir -p "${TEST_DIR}"
      touch "${LOADED_MARKER}"
      echo "  -> dvdrental caricato."
    fi
  else
    echo "  -> Dump dvdrental non trovato in ${DVD_DUMP} — saltato."
    echo "     Imposta DVD_DUMP=/percorso/file.tar per caricarlo."
  fi
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
[[ "$DO_PG" == true ]] && echo "  PostgreSQL:           postgresql://${PG_USER}:${PG_PASSWORD}@localhost:${PG_PORT}/${PG_DB}"
echo "  Ctrl+C per fermarlo."
echo "========================================="

cd "${TEST_DIR}"
npx node-red --userDir "${TEST_DIR}" --port "${PORT}"
