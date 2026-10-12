# Deploying the SIG-DESK beta on one server

## Objective

Run the approved frontend and backend release on one durable server, with one
HTTPS origin and no dependency on a developer login session. This procedure
does not publish Catalog definitions or workflows and never imports `*_local`
data.

## Network shape

```text
corporate clients -> TCP 443 -> edge Nginx
                               |-> frontend:8080
                               |-> /sigdesk-api/* -> Kong:8000 -> domain APIs
                               `-> /sigtools/* -> corporate SIGTools HTTPS

domain APIs -> private runtime network -> PostgreSQL / Kafka / Temporal / S3
domain APIs -> private application network -> service-to-service HTTP
```

No infrastructure or domain-service port is published. SSH is restricted to
the administrator VPN/subnet.

## 1. Freeze and retrieve the release

Create an annotated beta tag after the release gate passes. Record both the
root/frontend commit and the Backend gitlink commit. On the server, use a clean
checkout and verify that there are no modified or untracked files. Never deploy
the shared development checkout.

Build and publish images from the frozen commits:

```powershell
pwsh ./deploy/beta/build-beta-images.ps1 `
  -Registry registry.sig.systems/sigdesk `
  -Release beta-2026.10.12.1 `
  -OutputFile ./images.lock.env `
  -Push
```

Copy the resulting digest references into the protected beta environment file.
Sign and scan images in CI before approval.

## 2. Prepare the server

Recommended host: Ubuntu Server 24.04 LTS, static IP, NTP, Docker Engine,
Compose v2 and PowerShell 7. Allocate a dedicated disk or filesystem for
Docker data and backups. Configure DNS before issuing the certificate.

```bash
sudo mkdir -p /etc/sigdesk/tls /srv/sigdesk-backups
sudo chmod 700 /etc/sigdesk /etc/sigdesk/tls /srv/sigdesk-backups
pwsh ./deploy/beta/new-beta-env.ps1 -Destination /etc/sigdesk/beta.env
sudo chmod 600 /etc/sigdesk/beta.env /etc/sigdesk/tls/*
```

Fill every remaining placeholder. Use a beta Microsoft sender, a read-only
SIGTools credential for Assets, and an approved corporate CA file. Do not place
secrets in the checkout.

Apply firewall policy only from an administrator shell:

```bash
sudo ADMIN_CIDR=10.0.0.0/8 ./deploy/beta/firewall/ufw-beta.sh
```

Review the CIDR first; the example is not an instruction to authorize an
entire corporate network for SSH.

## 3. Validate before the first start

```powershell
pwsh ./deploy/beta/manage-beta.ps1 validate -EnvFile /etc/sigdesk/beta.env
```

Validation fails if it finds placeholders, mutable images, local databases,
development endpoints, HTTP SIGTools endpoints, missing certificates, unsafe
env-file permissions or a published port outside the edge.

Take a host/VM snapshot if the infrastructure policy supports it, then start:

```powershell
pwsh ./deploy/beta/manage-beta.ps1 up -EnvFile /etc/sigdesk/beta.env
pwsh ./deploy/beta/manage-beta.ps1 status -EnvFile /etc/sigdesk/beta.env
pwsh ./deploy/beta/manage-beta.ps1 smoke -EnvFile /etc/sigdesk/beta.env
```

For a server that hosts the models locally, append `-LocalAI` to `validate`,
`up`, `status`, `logs` and `down` consistently.

## 4. Schema and seed rules

All databases are newly named `*_beta`; the initialization script creates a
separate login and database for every bounded context. The first application
startup applies each service's current idempotent schema. Before activation:

1. capture a backup;
2. restart the application once;
3. confirm a second schema/object fingerprint is identical;
4. run the source-to-live schema convergence check;
5. run the release gate against disposable databases;
6. seed only the approved beta foundation;
7. activate Catalog/workflow versions under the separate PO runbook.

Never seed over an incompatible Catalog definition and never copy development
databases into beta.

## 5. Authentication and Assets

The browser talks only to the beta origin. `/sigtools` is a server-side proxy
to corporate SIGTools, which avoids browser CORS and HTTP mixed-content errors.
The edge verifies the SIGTools TLS chain and rewrites the cookie domain to the
beta hostname.

Organization uses SIGTools for corporate identity. Resource Service keeps its
existing upstream variable names for compatibility, but the beta values must
point to the approved SIGTools read API and a read-only token. The E2E Inventory
server is rejected by validation and is never a beta data source.

LDAP group-to-role mapping remains explicit in SIGTools/Organization. Do not
derive SIG-DESK permissions from an arbitrary role display name.

## 6. Backup and restore drill

```powershell
pwsh ./deploy/beta/manage-beta.ps1 backup `
  -EnvFile /etc/sigdesk/beta.env `
  -BackupRoot /srv/sigdesk-backups
```

The command quiesces writers for a short maintenance window, writes 13 dumps
(11 bounded contexts plus Temporal and visibility), copies object-storage and
Kafka state, validates each database dump with `pg_restore --list`, records
size and SHA-256, and restores the stack. Copy the completed directory
off-host.

Restore only to a new database:

```powershell
pwsh ./deploy/beta/restore-beta.ps1 `
  -EnvFile /etc/sigdesk/beta.env `
  -ManifestPath /srv/sigdesk-backups/<timestamp>/manifest.json `
  -SourceDatabase sigdesk_tickets_beta `
  -TargetDatabase sigdesk_tickets_restore_20261012 `
  -ConfirmToken RESTORE_TO_NEW_DATABASE:sigdesk_tickets_restore_20261012
```

Verify the restored database independently. A cutover requires a separate
review; the restore tool never changes application URLs.

## 7. Reboot survival

```bash
sudo ./deploy/beta/install-systemd.sh /opt/sigdesk /etc/sigdesk/beta.env
sudo systemctl start sigdesk-beta
sudo systemctl status sigdesk-beta
```

Reboot the server once during acceptance. After reboot, repeat `status`,
`smoke`, authentication and one read-only Assets check.

## 8. Acceptance checklist

- valid TLS and DNS; only 443 and restricted SSH reachable;
- login, logout and role hydration through SIGTools;
- Catalog and active workflow versions match the approved release;
- incident creation, duplicate path, IT 1, IT 2, RFC, Work Order and RQS;
- direct task detail by internal and human ID;
- Assets sites/devices read from SIGTools;
- attachments, SLA, notifications and audit;
- Kafka redelivery idempotency and Temporal restart recovery;
- no browser console 401/502/CORS/mixed-content errors;
- off-host backup and successful isolated restore drill;
- restart after host reboot;
- `_local` fingerprints remain untouched.

## 9. Operational limitations

This is a controlled single-host beta, not a highly available production
platform. PostgreSQL, Kafka, Temporal and the application share one failure
domain. Internal Temporal and Kafka transport is private-network plaintext.
Production requires HA/external dependencies, Temporal TLS, a real secret
manager, centralized telemetry and independently operated backups.
