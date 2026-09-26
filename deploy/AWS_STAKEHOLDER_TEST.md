# AWS stakeholder-test runbook

This runbook is for a temporary stakeholder-accessible test. It is not the final air-gapped installation.

## Recommended shape and expected cost

Use one Amazon Lightsail Linux instance in **Mumbai (`ap-south-1`)**, because Lightsail is not currently offered in Bahrain or UAE and AWS recommends a region near the users. Select the public-IPv4 Linux plan with **2 vCPU, 4 GB RAM, and 80 GB SSD**. The published bundle price is **USD 24/month**, before optional snapshots, DNS registration, taxes, or excess transfer. A 2 GB/USD 12 plan may run the services, but building two frontends, two Node images, MySQL, and Caddy on that host leaves little operating headroom.

At USD 24/month, USD 100 of eligible, unexpired credit is roughly four instance-months before optional charges. Confirm the credit's eligible services and expiration in **Billing -> Credits**; never assume that the displayed balance covers every service. Create a USD 25 actual-cost alert and a USD 35 forecast alert before launch.

The test topology is deliberately compact:

```text
Internet -> Caddy HTTPS -> admin static UI + main API
                       -> parent static UI + parent API
                                 |
                         private Docker network
                                 |
                       MySQL + protected volumes
```

Only ports 80 and 443 are public to stakeholders. MySQL, port 3001, and port 4000 remain inside Docker. Restrict SSH/22 to the operator's current public IP and close it when not being used.

## Before any resource is created

1. Enable MFA on the AWS root user and do not create root access keys.
2. Use an administrative IAM identity or AWS CLI browser login with temporary credentials.
3. Verify the credit amount, expiry, and applicable products.
4. Create AWS Budgets notifications.
5. Decide the final two DNS names, for example `admin.test.example.org` and `parents.test.example.org`.
6. Decide how test data will be handled. Do not upload real CNICs, bank evidence, or child documents until the stakeholder approves the internet-hosted test environment.

## Create the Lightsail host

In the Lightsail console:

1. Choose **Create instance**, region **Mumbai**, an **OS Only Ubuntu LTS** blueprint, and the 4 GB Linux bundle.
2. Name it `scms-stakeholder-test` and enable automatic snapshots if the extra snapshot cost is accepted.
3. Create and attach a Lightsail static IP.
4. In Networking, allow HTTP/80 and HTTPS/443 from all clients. Allow SSH/22 only from the operator's public IP.
5. Point both chosen DNS `A` records to the static IP. DNS must resolve before Caddy can obtain certificates.

Connect as the Ubuntu user and install the host prerequisites:

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2 unzip
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
sudo install -d -o "$USER" -g "$USER" -m 0750 /opt/scms
```

Sign out and reconnect once so the Docker group change takes effect.

## Transfer and launch the release

Transfer a clean copy of this project to `/opt/scms`. Do not transfer `.env`, `.scms-data`, `node_modules`, development uploads, database dumps, or real documents. The committed `.dockerignore` excludes these from images, but it does not replace careful release packaging.

On the server:

```bash
cd /opt/scms
cp deploy/.env.production.example deploy/.env.production
chmod 600 deploy/.env.production
```

Edit every placeholder in `deploy/.env.production`. Use two long URL-safe alphanumeric MySQL passwords and independent random values for `PORTAL_JWT_SECRET` and `PORTAL_API_KEY`. Set the two real DNS names and an operational certificate email. Never commit or send the populated file in chat.

Then build and start:

```bash
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml build
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml up -d
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml ps
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml logs --tail=200
```

Verify both HTTPS URLs, the API health checks, Director login, parent registration, document download authorization, banking exclusions, and role/authority scope before inviting stakeholders. Create named stakeholder accounts; never share the Director credential.

Authority staff use named RBAC accounts on the admin/staff URL, with the appropriate authority scopes. The production proxy redirects the retired shared-password `authority.html` page to that login, and the legacy authority API remains disabled.

## Backups, updates, and teardown

- Take an encrypted Lightsail snapshot before each update and record its cost.
- Back up the MySQL and all document/import volumes as one recovery set. A database-only backup is incomplete.
- Test a restore before placing real operational data in the host.
- Keep the previous image/release until the smoke test passes.
- When testing ends, download required backups, verify them, then delete the instance, static IP, snapshots, DNS zone, and any other test resources. Check Billing and Cost Explorer afterward; stopping an instance is not the same as deleting every billable resource.

## Source visibility boundary

Stakeholders using a browser receive minified frontend JavaScript, which every web browser must download. The production build does not emit source maps or development component-location metadata. Backend source, secrets, database contents, and uploaded files are not web-served. Anyone with AWS account, root, SSH, Docker-daemon, or server-administrator access can still inspect server artifacts, so those privileges must remain restricted to trusted operators.
