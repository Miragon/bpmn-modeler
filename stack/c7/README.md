# Camunda 7

Local development stack for testing Basic Auth-secured BPMN deployment and process management.

## Quickstart

Start all services:
```bash
docker compose up -d
```

## Services

| Service              | Port   | Purpose                                                    |
|----------------------|--------|------------------------------------------------------------|
| Camunda BPM Platform | `8080` | REST API, Cockpit, Tasklist, Admin (all-in-one container)  |

## Credentials

### REST API (Basic Auth)

| Field    | Value                                |
|----------|--------------------------------------|
| Endpoint | `http://localhost:8080/engine-rest`  |
| Username | `demo`                               |
| Password | `demo`                               |

> **Note:** Basic Auth on the REST API is disabled by default in the Docker image.
> The custom `web.xml` mounted into the container enables it.

### Cockpit / Admin / Tasklist UI

| Field    | Value                                                          |
|----------|----------------------------------------------------------------|
| URL      | `http://localhost:8080/camunda/app/welcome/default/#!/welcome` |
| Username | `demo`                                                         |
| Password | `demo`                                                         |

## VS Code Extension

Configure the deployment panel in the BPMN Modeler extension:

| Setting   | Value                                |
|-----------|--------------------------------------|
| Endpoint  | `http://localhost:8080/engine-rest`  |
| Auth type | `Basic`                              |
| Username  | `demo`                               |
| Password  | `demo`                               |
