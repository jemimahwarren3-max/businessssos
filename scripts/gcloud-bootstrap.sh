#!/usr/bin/env bash
# One-time GCP setup from the CLI. Do not use the Cloud Run "Create service"
# console — GitHub Actions creates the service on the first deploy.
set -euo pipefail

PROJECT="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID to your Google Cloud project id}"
REGION="${GCP_REGION:-europe-west1}"
SERVICE="${CLOUD_RUN_SERVICE:-kwetuu}"
REPO="${ARTIFACT_REPO:-kwetuu}"
DOMAIN="${APP_DOMAIN:-mykwetuu.com}"

gcloud config set project "${PROJECT}"
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  domains.googleapis.com

if ! gcloud artifacts repositories describe "${REPO}" --location="${REGION}" >/dev/null 2>&1; then
  gcloud artifacts repositories create "${REPO}" \
    --repository-format=docker \
    --location="${REGION}" \
    --description="Kwetuu Cloud Run images"
fi

gcloud iam service-accounts create kwetuu-github --display-name="Kwetuu GitHub deploy" 2>/dev/null || true
gcloud iam service-accounts create kwetuu-run --display-name="Kwetuu Cloud Run runtime" 2>/dev/null || true

GITHUB_SA="kwetuu-github@${PROJECT}.iam.gserviceaccount.com"
RUN_SA="kwetuu-run@${PROJECT}.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding "${PROJECT}" --member="serviceAccount:${GITHUB_SA}" --role="roles/run.admin" --condition=None
gcloud projects add-iam-policy-binding "${PROJECT}" --member="serviceAccount:${GITHUB_SA}" --role="roles/artifactregistry.writer" --condition=None
gcloud projects add-iam-policy-binding "${PROJECT}" --member="serviceAccount:${GITHUB_SA}" --role="roles/iam.serviceAccountUser" --condition=None
gcloud projects add-iam-policy-binding "${PROJECT}" --member="serviceAccount:${GITHUB_SA}" --role="roles/secretmanager.viewer" --condition=None

gcloud projects add-iam-policy-binding "${PROJECT}" --member="serviceAccount:${RUN_SA}" --role="roles/secretmanager.secretAccessor" --condition=None

ensure_secret() {
  local name="$1"
  if gcloud secrets describe "${name}" >/dev/null 2>&1; then
    echo "Secret ${name} already exists."
    return
  fi
  if [ -z "${2:-}" ]; then
    echo "Create secret ${name} then rerun, or pipe the value:"
    echo "  printf '%s' 'VALUE' | gcloud secrets create ${name} --data-file=-"
    return
  fi
  printf '%s' "$2" | gcloud secrets create "${name}" --data-file=-
}

ensure_secret SESSION_SECRET "${SESSION_SECRET:-}"
ensure_secret SUPABASE_SERVICE_ROLE_KEY "${SUPABASE_SERVICE_ROLE_KEY:-}"
if [ -n "${RESEND_API_KEY:-}" ]; then
  ensure_secret RESEND_API_KEY "${RESEND_API_KEY}"
fi
if [ -n "${MAIL_FLUSH_SECRET:-}" ]; then
  ensure_secret MAIL_FLUSH_SECRET "${MAIL_FLUSH_SECRET}"
fi

echo
echo "Create a key for GitHub (once):"
echo "  gcloud iam service-accounts keys create github-kwetuu.json --iam-account=${GITHUB_SA}"
echo "Then add GitHub Actions secrets:"
echo "  GCP_PROJECT_ID=${PROJECT}"
echo "  GCP_SA_KEY=   (full contents of github-kwetuu.json)"
echo "  APP_URL=https://${DOMAIN}"
echo "  STAGING_SUPABASE_URL / STAGING_SUPABASE_PUBLISHABLE_KEY / STAGING_SUPABASE_PROJECT_ID"
echo
echo "After the first GitHub deploy succeeds, map the domain (beta: fully managed Cloud Run):"
echo "  gcloud beta run domain-mappings create --service=${SERVICE} --domain=${DOMAIN} --region=${REGION}"
echo "  gcloud beta run domain-mappings create --service=${SERVICE} --domain=www.${DOMAIN} --region=${REGION}"
echo "Put the printed DNS records on ${DOMAIN} at your registrar. Wait for certificate Ready."
echo "First APP_URL can be the https://….run.app URL; switch APP_URL to https://${DOMAIN} and redeploy after DNS works."
