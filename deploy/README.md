# SCMS stakeholder-test deployment

This package runs the two browser portals, both Node APIs, MySQL, protected document/import storage, and an HTTPS reverse proxy on one Linux host. It is intended for a controlled stakeholder test, not the final air-gapped production installation.

## Required before launch

1. A Linux server with at least 2 vCPU, 4 GB RAM, and 40 GB persistent disk.
2. Docker Engine with the Compose plugin.
3. Two DNS records you control, such as `admin.example.com` and `parents.example.com`, pointing to the server's static public IPv4 address.
4. Inbound TCP 80/443 and UDP 443 only for application users. On EC2, prefer AWS Systems Manager Session Manager. On Lightsail, restrict SSH/22 to the operator's current public IP and close it when not needed. Never expose MySQL or ports 3001/4000.
5. An AWS budget alarm and MFA on the AWS account before creating infrastructure.

Use long, randomly generated, URL-safe alphanumeric MySQL passwords in the environment file. Compose places the application password inside a MySQL URL, so unescaped URL punctuation would change how that URL is parsed.

## Configure and launch

```bash
cd /opt/scms
cp deploy/.env.production.example deploy/.env.production
chmod 600 deploy/.env.production
# Edit every placeholder. Never commit this file.
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml build
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml up -d
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml ps
```

Caddy obtains and renews TLS certificates after both DNS names resolve to the host. The main API applies database migrations during startup. Bootstrap the first Director only after HTTPS is working, then remove bootstrap secrets from the environment.

## Backups and upgrades

- Take an encrypted server snapshot before each upgrade.
- Back up the MySQL volume plus the document, import, and legacy-upload volumes together; database-only backups are incomplete.
- Test restoration on a separate host before stakeholder use.
- Pull/copy the new release, rebuild images, run the build and migration checks, then recreate services. Retain the previous release and snapshot for rollback.

Browser users receive compiled/minified JavaScript because that is how web applications work. They do not receive backend source, database credentials, uploaded-file paths, or server configuration. Disable source maps in production builds and restrict server administration to trusted operators.

For the recommended temporary AWS setup, including estimated cost, DNS, upload, launch, backup, and teardown steps, see `deploy/AWS_STAKEHOLDER_TEST.md`.
