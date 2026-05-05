#!/usr/bin/env bash
# Login ל-ECR, בונה app + frontend, דוחף לפי BACKEND_IMAGE / FRONTEND_IMAGE
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

: "${BACKEND_IMAGE:?Set BACKEND_IMAGE in .env (full ECR URI)}"
: "${FRONTEND_IMAGE:?Set FRONTEND_IMAGE in .env (full ECR URI)}"
: "${AWS_REGION:=${AWS_DEFAULT_REGION:-}}"
if [[ -z "${AWS_REGION}" ]]; then
  echo "Set AWS_REGION or AWS_DEFAULT_REGION" >&2
  exit 1
fi

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
REGISTRY="${ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com"

echo "Logging in to ${REGISTRY} ..."
aws ecr get-login-password --region "${AWS_REGION}" | docker login --username AWS --password-stdin "${REGISTRY}"

echo "Building app + frontend ..."
docker compose build app frontend

echo "Pushing ${BACKEND_IMAGE} ..."
docker push "${BACKEND_IMAGE}"

echo "Pushing ${FRONTEND_IMAGE} ..."
docker push "${FRONTEND_IMAGE}"

echo "Done."
