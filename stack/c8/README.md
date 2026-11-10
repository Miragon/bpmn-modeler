# Camunda 8 stack

A local Camunda 8 (Zeebe, Operate) with an OAuth2-secured REST API behind Keycloak, to test
deployment and Start Instance from the modeler.

## Start

1. Start the services:

    ```bash
    docker compose up -d
    ```

2. Run the Keycloak setup once. Keycloak 26 ignores `serviceAccountsEnabled` and the audience
   mappers when it imports the realm, and the script sets them:

    ```bash
    ./setup-keycloak.sh
    ```

## Services

| Service | Port | Purpose |
| --- | --- | --- |
| Zeebe | `8080`, gRPC `26500` | REST API (OAuth2) |
| Operate | `8081` | Web UI for processes and instances |
| Keycloak | `18080` | OAuth2 / OpenID Connect provider |
| Elasticsearch | `9200` | Zeebe exporter and Operate data store |
| Postgres | none | Keycloak persistence, internal only |

## Credentials

| What | URL | Username | Password |
| --- | --- | --- | --- |
| Operate | `http://localhost:8081` | `demo` | `demo` |
| Keycloak admin console | `http://localhost:18080` | `admin` | `admin` |

The REST API takes a `client_credentials` token for client `zeebe-client` with secret
`test-secret` and audience `zeebe-api`, from
`http://localhost:18080/realms/camunda-platform/protocol/openid-connect/token`.

## Deployment target in the modeler

The deployment form is the same in VS Code, the desktop app and IntelliJ:

| Field | Value |
| --- | --- |
| Engine | `Camunda Cloud 8` |
| REST Endpoint | `http://localhost:8080` |
| Method | `OAuth2 Client Credentials` |
| Client ID | `zeebe-client` |
| Client Secret | `test-secret` |
| Token Endpoint | `http://localhost:18080/realms/camunda-platform/protocol/openid-connect/token` |
| Audience | `zeebe-api` |
