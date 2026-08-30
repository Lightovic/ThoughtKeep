#!/usr/bin/env bash
# T20 — prove The Gate fails CLOSED when Model Armor is unreachable.
#
# This deploys a BROKEN revision on purpose, then rolls back.
# Read the whole script before running it. Takes about 8 minutes.
set -e
PROJECT=true-rampart-464602-i0
REGION=asia-southeast1

echo "=== Step 1: remember the CURRENT serving revision ==="
GOOD=$(gcloud run services describe thoughtkeep-app --region $REGION --project $PROJECT \
  --format="value(status.traffic[0].revisionName)")
echo "GOOD REVISION = $GOOD"
echo "$GOOD" > ~/tk-good-revision.txt
echo "(Saved to ~/tk-good-revision.txt in case this terminal closes.)"

echo
read -p "Deploy a deliberately broken screening config? Type YES to continue: " ok
[ "$ok" = "YES" ] || { echo "Aborted."; exit 1; }

echo
echo "=== Step 2: point Model Armor at a template that does not exist ==="
gcloud run services update thoughtkeep-app --region $REGION --project $PROJECT \
  --update-env-vars MODEL_ARMOR_TEMPLATE=this-template-does-not-exist

echo
echo "=== Step 3: NOW GO AND TEST IN THE BROWSER ==="
echo "Send an ORDINARY, harmless message, for example:"
echo "    Today was long but I finished what I set out to do."
echo
echo "EXPECTED: it is BLOCKED with a calm message saying the safety check"
echo "could not be completed and nothing was sent or saved."
echo "A normal reflection appearing instead would mean the gate fails OPEN."
echo
read -p "Press Enter once you have tested and screenshotted the result... "

echo
echo "=== Step 4: roll back to the working configuration ==="
gcloud run services update thoughtkeep-app --region $REGION --project $PROJECT \
  --update-env-vars MODEL_ARMOR_TEMPLATE=thoughtkeep-gate

echo
echo "=== Step 5: confirm normal service is restored ==="
gcloud run services describe thoughtkeep-app --region $REGION --project $PROJECT \
  --format="yaml(spec.template.spec.containers[0].env)" | grep -A1 MODEL_ARMOR_TEMPLATE
echo
echo "NOW TEST AGAIN IN THE BROWSER. An ordinary message must work normally."
echo "Do not finish Phase 6 until you have confirmed that."