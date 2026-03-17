# Camunda 8

Local development stack for testing OAuth2-secured BPMN deployment and process management.

## Quickstart

1. Start all services:
   ```bash
   docker compose up -d
   ```

2. Run the Keycloak setup script once (workaround for a Keycloak 26 import bug that
   ignores `serviceAccountsEnabled` and audience mappers during realm import):
   ```bash
   ./setup-keycloak.sh
   ```

## Services

| Service         | Port    | Purpose                                       |
|-----------------|---------|-----------------------------------------------|
| Zeebe           | `8080`  | REST API (OAuth2-secured), gRPC on `26500`    |
| Operate         | `8081`  | Web UI for inspecting workflows and instances  |
| Keycloak        | `18080` | OAuth2 / OpenID Connect identity provider      |
| Elasticsearch   | `9200`  | Zeebe exporter backend and Operate data store  |
| Postgres        | —       | Keycloak persistence (internal only)           |

## Credentials

### Zeebe OAuth2 (REST API)

| Field         | Value                                                                                     |
|---------------|-------------------------------------------------------------------------------------------|
| Endpoint      | `http://localhost:8080`                                                                   |
| Token URL     | `http://localhost:18080/realms/camunda-platform/protocol/openid-connect/token`            |
| Client ID     | `zeebe-client`                                                                            |
| Client Secret | `test-secret`                                                                             |
| Audience      | `zeebe-api`                                                                               |
| Grant type    | `client_credentials`                                                                      |

### Operate UI

| Field    | Value                      |
|----------|----------------------------|
| URL      | `http://localhost:8081`    |
| Username | `demo`                     |
| Password | `demo`                     |

### Keycloak Admin Console

| Field    | Value                              |
|----------|------------------------------------|
| URL      | `http://localhost:18080`           |
| Username | `admin`                            |
| Password | `admin`                            |


## VS Code Extension

Configure the deployment panel in the BPMN Modeler extension:

| Setting       | Value                                                                          |
|---------------|--------------------------------------------------------------------------------|
| Endpoint      | `http://localhost:8080`                                                        |
| Auth type     | `OAuth2`                                                                       |
| Token URL     | `http://localhost:18080/realms/camunda-platform/protocol/openid-connect/token` |
| Client ID     | `zeebe-client`                                                                 |
| Client Secret | `test-secret`                                                                  |
| Audience      | `zeebe-api`                                                                    |
