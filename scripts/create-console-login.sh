#!/usr/bin/env bash
# Create a console login (Firebase Auth, project lumeniq-platform).
# The password is typed at the prompt: never on the command line, never in
# shell history. With no admin claim the login is a consultant; an email on the
# certifier list (CONSOLE_CERTIFIER_EMAILS) sees only the Hotelbeds page.
#
#   scripts/create-console-login.sh hotelbeds-cert@firstclass.com.au
set -euo pipefail

EMAIL="${1:-hotelbeds-cert@firstclass.com.au}"
# The console's public web key (also in cloudbuild.yaml). Not a secret.
KEY="AIzaSyBrhc2KFBKfSTGZa68rd4DBmogHrLySRpU"

read -r -s -p "Password for $EMAIL: " PW; echo
read -r -s -p "Again: " PW2; echo
[ "$PW" = "$PW2" ] || { echo "Passwords don't match."; exit 1; }
[ "${#PW}" -ge 12 ] || { echo "Use at least 12 characters."; exit 1; }

BODY=$(EMAIL="$EMAIL" PW="$PW" python3 -c 'import json,os; print(json.dumps({"email":os.environ["EMAIL"],"password":os.environ["PW"],"returnSecureToken":False}))')
unset PW PW2

RESP=$(curl -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$KEY" \
  -H "Content-Type: application/json" -d "$BODY")
unset BODY

if echo "$RESP" | grep -q '"email"'; then
  echo "Created: $EMAIL"
else
  echo "Not created: $(echo "$RESP" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("error",{}).get("message","unknown error"))')"
  exit 1
fi
