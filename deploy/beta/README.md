# SIG-DESK beta: single-server deployment

This package runs the frontend and backend on one server without reusing any
`*_local` database. It combines:

- `BACKEND/compose.prod.yaml`: hardened application services;
- `deploy/beta/compose.infra.yaml`: persistent beta infrastructure;
- `deploy/beta/compose.overlay.yaml`: same-origin frontend and edge gateway.

Only the edge publishes a port. PostgreSQL, Kafka, Temporal, object storage,
Kong and all domain services remain on private Docker networks.

## Required host

- Docker Engine 27+ and Docker Compose v2;
- PowerShell 7 (`pwsh`) for the management command;
- a DNS name resolving to the server;
- a TLS certificate, private key and the CA chain used to validate SIGTools;
- at least 8 CPU / 32 GiB RAM without local AI, or 16 CPU / 64 GiB RAM with
  the `ai-local` profile;
- a dedicated filesystem for Docker volumes and external backups.

Docker Desktop is not an unattended server supervisor. Linux with the supplied
systemd unit is the supported long-running topology.

## Install

1. Check out an approved, immutable release. Do not deploy a dirty developer
   checkout.
2. Copy `beta.env.example` to `/etc/sigdesk/beta.env`, replace every
   `CHANGE_ME`, set image references to approved immutable images, then run:

   ```powershell
   pwsh ./deploy/beta/manage-beta.ps1 validate -EnvFile /etc/sigdesk/beta.env
   pwsh ./deploy/beta/manage-beta.ps1 up -EnvFile /etc/sigdesk/beta.env
   pwsh ./deploy/beta/manage-beta.ps1 smoke -EnvFile /etc/sigdesk/beta.env
   ```

3. Install `systemd/sigdesk-beta.service` only after `validate` and `smoke`
   pass. Replace `@@SIGDESK_ROOT@@` and `@@SIGDESK_ENV@@` first.

The frontend is compiled with `/sigdesk-api` and `/sigtools`. The edge strips
those prefixes and proxies to Kong and SIGTools. Browser traffic therefore
uses one HTTPS origin; no broad CORS policy is needed.

## Commands

```powershell
pwsh ./deploy/beta/manage-beta.ps1 validate -EnvFile /etc/sigdesk/beta.env
pwsh ./deploy/beta/manage-beta.ps1 up       -EnvFile /etc/sigdesk/beta.env
pwsh ./deploy/beta/manage-beta.ps1 status   -EnvFile /etc/sigdesk/beta.env
pwsh ./deploy/beta/manage-beta.ps1 logs     -EnvFile /etc/sigdesk/beta.env
pwsh ./deploy/beta/manage-beta.ps1 backup   -EnvFile /etc/sigdesk/beta.env
pwsh ./deploy/beta/manage-beta.ps1 down     -EnvFile /etc/sigdesk/beta.env
```

`down` never passes `--volumes`. Deleting volumes is intentionally not exposed
by the management command.

`up` pulls the approved digest-pinned images before starting. `start` uses only
already installed images and is reserved for the systemd reboot path, so a
temporary registry outage cannot prevent a previously deployed beta boot.

## Local AI profile

The application can use approved remote embedding/reranking/LLM endpoints, or
start the local dependencies:

```powershell
pwsh ./deploy/beta/manage-beta.ps1 up -EnvFile /etc/sigdesk/beta.env -LocalAI
```

When `-LocalAI` is selected, set `TEI_URL`, `RERANKER_URL` and `LLM_BASE_URL`
to the internal service names shown in `beta.env.example`.
Validation refuses those internal names unless `-LocalAI` is present; without
that switch all three endpoints must be approved HTTPS services.

## Backups and restore

`backup` opens a short maintenance window, creates one custom-format dump per
database, copies object-storage and Kafka state, then writes a SHA-256 manifest
outside Docker volumes and restores the stack. Copy that directory to a
different machine or backup system. A file on the same PC is not disaster
recovery.

Restore is deliberately not an in-place operation. Use `restore-beta.ps1` to
restore one dump into a new database name, validate it, then perform a reviewed
cutover. The script rejects every active beta database name.

## Update and rollback

1. Back up and copy the backup off-host.
2. Record current image references and release commit.
3. Update only the immutable image references in the protected env file.
4. Run `validate`, `pull`, `up`, and `smoke`.
5. Roll back by restoring the previous image references. Never roll back by
   deleting databases or volumes. Schema-incompatible releases require their
   reviewed migration rollback or restore into new databases.

## Important boundaries

- This stack uses persistent Temporal, but its transport is private-network
  plaintext in the single-host beta. Production still requires Temporal TLS.
- Kafka is plaintext only inside the private Docker network and has no host
  port.
- Application secrets are supplied through a root-owned env file because the
  current services consume environment variables. Do not commit that file.
- `INVENTORY_API_URL` currently names the resource service's upstream contract.
  Point it at the approved SIGTools read API and use a read-only credential.
  The deployment validator rejects the known E2E inventory server.
- Publishing Catalog definitions or workflows is not part of `up`; activation
  remains a separately authorized business operation.
