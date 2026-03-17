#!/bin/bash
# Configures the zeebe-client in Keycloak to enable service accounts and add the audience mapper.
# Run after Keycloak is healthy.

set -e

KEYCLOAK_URL="http://localhost:18080"
REALM="camunda-platform"

echo "Waiting for Keycloak..."
until curl -sf "$KEYCLOAK_URL/realms/$REALM" > /dev/null 2>&1; do
  sleep 2
done

echo "Obtaining admin token..."
TOKEN=$(curl -sf -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -d "grant_type=password&client_id=admin-cli&username=admin&password=admin" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

echo "Looking up zeebe-client ID..."
CLIENT_ID=$(curl -sf "$KEYCLOAK_URL/admin/realms/$REALM/clients?clientId=zeebe-client" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")

echo "Enabling service accounts on zeebe-client..."
curl -sf -X PUT "$KEYCLOAK_URL/admin/realms/$REALM/clients/$CLIENT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"clientId\": \"zeebe-client\",
    \"secret\": \"test-secret\",
    \"serviceAccountsEnabled\": true,
    \"directAccessGrantsEnabled\": true,
    \"standardFlowEnabled\": false,
    \"publicClient\": false
  }"

echo "Adding zeebe-api audience mapper..."
curl -sf -X POST "$KEYCLOAK_URL/admin/realms/$REALM/clients/$CLIENT_ID/protocol-mappers/models" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "zeebe-audience",
    "protocol": "openid-connect",
    "protocolMapper": "oidc-audience-mapper",
    "consentRequired": false,
    "config": {
      "included.custom.audience": "zeebe-api",
      "id.token.claim": "false",
      "access.token.claim": "true"
    }
  }'

echo ""
echo "=== Setup complete ==="
echo "Zeebe REST API (OAuth2-secured): http://localhost:8080"
echo "Operate UI (basic auth):         http://localhost:8081  (demo/demo)"
echo ""
echo "Get a token:"
echo "  curl -X POST $KEYCLOAK_URL/realms/$REALM/protocol/openid-connect/token \\"
echo "    -d 'grant_type=client_credentials&client_id=zeebe-client&client_secret=test-secret'"
