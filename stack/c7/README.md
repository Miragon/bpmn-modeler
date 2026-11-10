# Camunda 7 stack

A local Camunda 7 engine with Basic Auth on its REST API, to test deployment and Start Instance
from the modeler.

## Start

```bash
docker compose up -d
```

Basic Auth is off in the stock image; the `web.xml` this stack mounts into the container turns it on.

## Services

| Service | Port | Purpose |
| --- | --- | --- |
| Camunda 7 (`camunda/camunda-bpm-platform`) | `8080` | REST API, Cockpit, Tasklist and Admin in one container |

## Credentials

| What | URL | Username | Password |
| --- | --- | --- | --- |
| REST API (Basic Auth) | `http://localhost:8080/engine-rest` | `demo` | `demo` |
| Cockpit, Tasklist, Admin | `http://localhost:8080/camunda/app/welcome/default/#!/welcome` | `demo` | `demo` |

## Deployment target in the modeler

The deployment form is the same in VS Code, the desktop app and IntelliJ:

| Field | Value |
| --- | --- |
| Engine | `Camunda Platform 7` |
| REST Endpoint | `http://localhost:8080/engine-rest` |
| Method | `Basic Auth` |
| Username | `demo` |
| Password | `demo` |
