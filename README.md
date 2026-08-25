# Bonefree production deployment

This guide deploys the shared multi-tenant Bonefree backend to an Ubuntu 24.04 VPS and the static frontend to an HTTPS hosting service. The frontend can be published as one global/shared application or as one tenant-specific application per tenant. Both modes use the same React code and the same backend.

Before starting, you need:

- an Oracle Cloud account and an Ubuntu 24.04 VPS;
- the SSH private key downloaded when the instance was created;
- a domain or subdomain that you can edit in your DNS provider;
- the repository URL and permission to clone it;
- the public HTTPS address or addresses of the separately hosted frontend;
- Node.js 24 and npm on the frontend build machine or CI runner.

Run every command in this guide on the VPS over SSH unless a step explicitly says to use the Oracle Cloud or DNS web console. Commands shown in the same code block should be run one line at a time.

## What will run

- **Image**: a packaged application with all its runtime dependencies.
- **Container**: a running process created from an image.
- **Docker Compose**: the file that starts and connects all containers.
- **Volume**: persistent storage. Recreating a container does not delete a volume.
- **Domain**: a public name such as `api.yourdomain.com` that points to the VPS IP address.
- **HTTPS**: an encrypted connection. Caddy automatically obtains and renews its certificate.
- **Shared frontend build**: one static artifact that can serve every registered tenant domain.
- **Tenant-specific frontend build**: a smaller static artifact that accepts only one tenant slug.

```text
Tenant domains ──► static frontend host
                         │ HTTPS API requests
                         ▼
API domain ──────► Caddy ──► FastAPI :8000
                                  │ internal Docker network
                                  ├── PostgreSQL :5432
                                  └── Redis :6379
```

Only Caddy publishes ports on the VPS. PostgreSQL, Redis, and the application's port 8000 are not accessible from the internet.

## Choose the frontend deployment mode

| Mode | Build command | Artifact | Use it when |
| --- | --- | --- | --- |
| Global/shared (recommended) | `npm run build` | `frontend/dist/` | One deployment should serve multiple tenant domains and tenant configuration should change without rebuilding. |
| Per tenant/app | `npm run build -- --tenant=tenant-slug` | `frontend/dist/` by default, or a directory selected with `--out-dir` | A tenant needs a physically pruned bundle containing only selected themes and features. |

The modes can coexist. For example, most domains can point to the shared artifact while one customer points to a dedicated artifact. Moving a tenant between modes does not require a database migration.

These rules apply to both modes:

- the backend resolves the browser hostname and remains the authority for tenant identity and feature entitlements;
- a build target controls only which frontend modules are present; it never grants backend access;
- the frontend always loads the tenant experience from the backend at runtime;
- a tenant-specific artifact stops with `deployment_tenant_mismatch` if it is served from a domain that the backend resolves to another tenant;
- every artifact publishes a non-secret `build-manifest.json` for deployment diagnostics.

## 1. Create and prepare the VPS

Create an **Ubuntu 24.04** instance in Oracle Cloud. Choose an Always Free-eligible shape if one is available. The project images support both AMD64 and ARM64/Ampere machines. Keep the boot volume attached permanently and use a reserved public IPv4 address if the address must survive infrastructure changes.

In the Oracle Cloud Console, note these values before continuing:

- the instance public IPv4 address;
- the username, normally `ubuntu` for the official Ubuntu image;
- the Virtual Cloud Network and subnet used by the instance;
- whether ingress rules are managed by a Security List, a Network Security Group, or both.

In the instance network, add these ingress rules to its Security List or Network Security Group:

| Protocol | Port | Source | Purpose |
| --- | ---: | --- | --- |
| TCP | 22 | Your public IP with `/32` | SSH |
| TCP | 80 | `0.0.0.0/0` | HTTP and certificate issuance |
| TCP | 443 | `0.0.0.0/0` | HTTPS |
| UDP | 443 | `0.0.0.0/0` | Optional HTTP/3 |

Do not open ports 5432, 6379, or 8000.

Connect over SSH. Replace the key path and IP address with your own values:

```bash
ssh -i oracle-key.pem ubuntu@VPS_PUBLIC_IP
```

Update the system and install the basic tools:

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y ca-certificates curl dnsutils git nano openssl
```

If you use the UFW firewall, allow SSH and web traffic before enabling it:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable
sudo ufw status
```

> Docker can bypass some UFW rules when it publishes container ports. This project reduces that risk by publishing only ports 80 and 443. Keep the Oracle Cloud network rules correctly configured as well.

## 2. Install Docker and Docker Compose

Use the official Docker package repository instead of the development convenience script:

```bash
for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do sudo apt remove -y "$pkg"; done
```

It is normal for this command to report that some packages are not installed.

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

```bash
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

Allow your user to run Docker, then reconnect to SSH:

```bash
sudo usermod -aG docker "$USER"
exit
```

After reconnecting, verify the installation:

```bash
docker --version
docker compose version
docker run --rm hello-world
```

Refer to the [official Docker installation guide for Ubuntu](https://docs.docker.com/engine/install/ubuntu/) if these commands change in a future release.

## 3. Configure the domain and DNS

Create this record at your DNS provider:

- Type: `A`
- Name: `api`, resulting in a domain such as `api.yourdomain.com`
- Value: the public IPv4 address of the VPS
- TTL: automatic or 300 seconds

Do not create an `AAAA` record unless the VPS has working IPv6 connectivity. Verify the DNS record:

```bash
dig +short api.yourdomain.com A
```

The result must be the VPS IP address. Caddy can only obtain a public certificate after DNS is correct and ports 80 and 443 are reachable.

DNS changes can take several minutes or, depending on the provider's previous TTL, several hours. Do not continue with certificate troubleshooting until `dig` returns the correct public IP.

## 4. Download and configure the project

Clone the repository and enter its directory:

```bash
git clone REPOSITORY_URL bonefree
cd bonefree
```

All remaining `docker compose` commands must be run from this `bonefree` directory, where `compose.yaml` is located.

Create the private environment file:

```bash
cp .env.example .env
chmod 600 .env
openssl rand -hex 32
nano .env
```

Copy the value generated by `openssl` into `POSTGRES_PASSWORD`. Use a hexadecimal password or only the characters `A-Z`, `a-z`, `0-9`, `_`, and `-`, because the password is included in the internal database URL.

The `.env` file belongs in the project root, next to `compose.yaml`, not inside `backend`. In `nano`, press `Ctrl+O`, then `Enter` to save, and `Ctrl+X` to exit.

For example, if the API is `api.shop.example` and the frontend is `https://shop.example`, the essential lines look like this:

```dotenv
API_DOMAIN=api.shop.example
POSTGRES_DB=bonefree
POSTGRES_USER=bonefree
POSTGRES_PASSWORD=paste_the_random_value_here
CORS_ORIGINS=https://shop.example,https://www.shop.example
```

Do not include `https://` in `API_DOMAIN`. Do include `https://` in every `CORS_ORIGINS` entry. Origins must not contain a path or trailing slash. Add every real frontend origin that browsers will use, including the `www` address only if that address actually hosts the frontend.

At a minimum, change these values:

- `API_DOMAIN`: the API domain without `https://` and without a trailing slash.
- `POSTGRES_PASSWORD`: the random password generated above.
- `CORS_ORIGINS`: the real HTTPS frontend addresses, separated by commas.
- SMTP settings if the application must send real emails.

Company, tax, contact, pickup, and receipt data comes from the organization's profile
in the database. Configure that profile through the administration API instead of
environment variables.

To enable SMTP, change `EMAIL_PROVIDER=terminal` to `EMAIL_PROVIDER=smtp` and fill in `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, and the sender addresses. The `terminal` provider only writes emails to the application logs.

> Important security notice: a previous version of `.env.example` contained a value that looked like an SMTP password. If it was a real credential, revoke it at the email provider and create a new one. Removing it from the current Git version does not remove it from history that has already been shared.

Never send `.env` through Git, email, or chat. Confirm that Git ignores it:

```bash
git check-ignore .env
```

The command should print a matching ignore rule. If it prints nothing, stop and fix `.gitignore` before continuing.

## 5. Validate, build, and start

Validate the configuration before downloading or building images:

```bash
docker compose config --quiet
```

Download the official service images and build the application image:

```bash
docker compose pull postgres redis caddy
docker compose build --pull api
```

Start everything in the background:

```bash
docker compose up -d
docker compose ps
```

During the first startup, PostgreSQL initializes its volume, Redis starts, the application applies the Alembic migrations, and Caddy begins forwarding requests only after the application becomes healthy. Follow the startup logs:

```bash
docker compose logs -f postgres redis api caddy
```

Press `Ctrl+C` to leave the log view. The containers will continue running.

The first boot can take a few minutes. Run `docker compose ps` again until PostgreSQL, Redis, and the API show `healthy` and Caddy shows `Up`. In the `PORTS` column, only Caddy should show host bindings for `80` and `443`; the API, PostgreSQL, and Redis must not show `0.0.0.0` bindings.

Test the application after replacing the example domain:

```bash
curl --fail --show-error https://api.yourdomain.com/health
```

The expected response is:

```json
{"status":"healthy"}
```

Also test from a browser or a machine outside the VPS. A successful `curl` executed only on the server does not prove that the Oracle ingress rules permit public traffic.

The `/docs`, `/redoc`, and `/openapi.json` pages are disabled in production by the application.

## 6. Create the first administrator

Run the interactive assistant. `docker compose exec` allocates an interactive terminal by default, which allows the script to hide the password:

```bash
docker compose exec api python -m scripts.create_first_owner
```

Enter the first name, last name, email address, and a strong password. Password input is hidden and must contain an uppercase letter, a lowercase letter, a number, and a special character.

The command uses the `bonefree` organization created by the migration. For another
organization, pass `--organization-slug your-slug`.

The command only works when no `owner` exists. It never changes an existing account. Use this email on the administrator login page afterward.

## 7. Load the initial catalog

Catalog categories and products require an owner in the current database model. The email is used only to find the active owner account and associate its internal ID with the imported records; it is not stored as catalog content and the script never reads or changes the owner's password.

First, validate the catalog bundle and confirm that the database and upload destination are empty:

```bash
docker compose exec api python -m scripts.seed_production_catalog --check
```

Then apply it with the exact owner email created in the previous step:

```bash
docker compose exec api python -m scripts.seed_production_catalog --apply --owner-email admin@yourdomain.com
```

Replace `admin@yourdomain.com` with the exact email entered in the previous step. The loader verifies the JSON data, image hashes, active owner, and destination. It writes the database and media through a rollback-protected operation. It never resets production. If a catalog or uploaded files already exist, the command stops without deleting anything. That refusal is a safety feature; do not use SQL or volume deletion to bypass it on a production installation.

Both commands default to the `bonefree` organization. Use
`--organization-slug your-slug` on both commands when loading another tenant.

After the import, open the frontend and confirm that categories, products, and product images appear. If they do not, inspect the browser developer console for CORS errors and the API logs with `docker compose logs --tail=200 api`.

## 8. Configure each production tenant

The migrations create the `bonefree` organization, its current experience and entitlements, and its known domains. For every additional tenant, create the organization and profile first:

```bash
docker compose exec api python -m scripts.create_organization \
  --name "Example Restaurant" \
  --slug example-restaurant \
  --email hello@example.com
```

If the tenant needs its own administration account, create its first owner interactively. You can then load that tenant's catalog with the section 7 commands and the same `--organization-slug` value:

```bash
docker compose exec api python -m scripts.create_first_owner \
  --organization-slug example-restaurant
```

Point the tenant's frontend DNS record to the static frontend host. After you have confirmed control of the domain and configured HTTPS there, register the hostname with the backend:

```bash
docker compose exec api python -m scripts.add_organization_domain \
  --organization-slug example-restaurant \
  --domain shop.example.com \
  --primary \
  --verified
```

Register each hostname that can appear in the browser address bar, such as both the apex and `www`, and add each corresponding origin to `CORS_ORIGINS`. Recreate the API container after changing `.env` with `docker compose up -d --force-recreate api`. Do not mark a domain as verified before domain control has actually been checked. The public resolver ignores unverified domains.

Enable only the backend capabilities purchased or required by the tenant. The currently known feature keys are `catalog`, `customer_accounts`, `ordering`, `reviews`, `loyalty`, and `events`:

```bash
docker compose exec api python -m scripts.set_feature_entitlement \
  --organization example-restaurant \
  --feature catalog \
  --enable
```

Repeat the command for each enabled feature. Use `--disable` to revoke one. Entitlements are authorization decisions: including a feature in a frontend build does not enable its protected API endpoints.

New organizations start with the neutral `base` theme and an empty page configuration. To apply a richer configuration, create an `experience.json` file on the VPS. This is the smallest valid document:

```json
{
  "schema_version": 1,
  "experience": {
    "theme": {
      "key": "base",
      "token_overrides": {}
    },
    "assets": {},
    "navigation": [],
    "pages": {},
    "variant_overrides": {}
  }
}
```

Validate it without storing changes, then apply it:

```bash
docker compose cp experience.json api:/tmp/experience.json
docker compose exec api python -m scripts.configure_organization_experience \
  --organization example-restaurant \
  --file /tmp/experience.json \
  --dry-run
docker compose exec api python -m scripts.configure_organization_experience \
  --organization example-restaurant \
  --file /tmp/experience.json
```

If the experience selects a theme or section, that theme or feature must also exist in the chosen frontend artifact. Test the backend bootstrap before publishing the frontend:

```bash
curl --fail --show-error \
  "https://api.yourdomain.com/public/organizations/resolve?hostname=shop.example.com"
curl --fail --show-error \
  -H "X-Organization-Slug: example-restaurant" \
  https://api.yourdomain.com/public/organization-experience
```

## 9. Build and deploy the frontend

Run the frontend build on a clean build machine or CI runner. `VITE_API_BASE_URL` is compiled into the artifact and must be the public HTTPS API address. `BUILD_ID` is optional but should identify the deployed commit:

```bash
cd frontend
npm ci
export VITE_API_BASE_URL=https://api.yourdomain.com
export BUILD_ID="$(git rev-parse --short HEAD)"
```

### Global/shared deployment

Build once:

```bash
npm run build
cat dist/build-manifest.json
```

The manifest must report `"build_mode": "shared"`. Publish the **contents** of `frontend/dist/` as one static site and attach every tenant frontend domain to that deployment. Each hostname must also be registered and verified in the backend as described in section 8.

A new tenant does not require another shared build when its required theme and features are already in the shared registries. Create its backend records, configure its domain, experience and entitlements, then point the domain to the existing artifact.

### Per-tenant/app deployment

Each dedicated build requires a versioned target at `frontend/build/targets/<tenant-slug>.json`. The target describes packaging policy only; it must not contain credentials, database IDs, or authorization state. For example:

```json
{
  "tenant": "example-restaurant",
  "themes": ["base"],
  "features": ["catalog", "customer_accounts", "ordering"],
  "configuration_source": "remote"
}
```

The available keys come from `frontend/build/catalog/features.mjs` and `frontend/build/catalog/themes.mjs`. Build into a separate directory so multiple tenant artifacts can be retained at the same time:

```bash
npm run build -- \
  --tenant=example-restaurant \
  --out-dir=dist/example-restaurant
cat dist/example-restaurant/build-manifest.json
```

The manifest must report `"build_mode": "tenant_specific"` and `"expected_tenant_slug": "example-restaurant"`. Publish only the **contents** of that directory to the static site assigned to this tenant's domain. Do not serve this artifact on another tenant's domain.

The repository already includes `frontend/build/targets/bonefree.json`, so the Bonefree-specific command is:

```bash
npm run build -- --tenant=bonefree --out-dir=dist/bonefree
```

### Static host requirements and smoke test

Configure the frontend host to:

- serve every domain through HTTPS;
- fall back to `index.html` for unknown paths so React routes such as `/menu` and `/orders` work on refresh;
- serve the generated `assets/` files as static files;
- avoid long-lived caching for `index.html` and `build-manifest.json`; hashed assets may be cached as immutable.

After publishing, check the artifact and tenant resolution:

```bash
curl --fail --show-error https://shop.example.com/build-manifest.json
curl --fail --show-error \
  "https://api.yourdomain.com/public/organizations/resolve?hostname=shop.example.com"
```

Then open the frontend, refresh a nested route, and confirm in the browser network panel that API calls use `https://api.yourdomain.com` and send the resolved `X-Organization-Slug` value.

## 10. Everyday commands

Check container status:

```bash
docker compose ps
```

View recent logs:

```bash
docker compose logs --tail=200 api
docker compose logs --tail=200 caddy
```

Restart only the application:

```bash
docker compose restart api
```

Stop and restart the stack while preserving data:

```bash
docker compose down
docker compose up -d
```

After a VPS reboot, Docker starts the containers automatically because the services use the `unless-stopped` restart policy. Verify this once with `docker compose ps` after a planned reboot.

> Never run `docker compose down -v` in production. The `-v` option removes the PostgreSQL, Redis, upload, and certificate volumes.

## 11. Update the application

Create a backup first. Then run:

```bash
git pull --ff-only
docker compose pull postgres redis caddy
docker compose build --pull api
docker compose up -d --remove-orphans
docker compose ps
curl --fail --show-error https://api.yourdomain.com/health
```

Recognized migrations are applied automatically when the new application container starts. If a migration fails, inspect the logs before making any manual database change.

Rebuild and publish the frontend after updating the backend:

- for a global/shared deployment, run `npm ci && npm run build` once and replace the shared static artifact;
- for per-tenant deployments, rebuild every affected target; rebuild all targets when shared frontend code or the build catalogs change;
- changing only remote experience data or entitlements does not require a frontend rebuild unless the desired theme or feature is absent from that tenant-specific artifact.

## 12. Backup and restore

Create a private directory that will not be committed:

```bash
mkdir -p backups
chmod 700 backups
```

Back up the `.env` file with encryption. It contains the credentials needed to reconnect the restored application. This command asks you to create an encryption passphrase; keep that passphrase in a password manager, not on the VPS:

```bash
openssl enc -aes-256-cbc -salt -pbkdf2 -in .env -out "backups/env-$(date +%F-%H%M%S).enc"
chmod 600 backups/env-*.enc
```

On a replacement server, decrypt it with `openssl enc -d -aes-256-cbc -pbkdf2 -in backups/ENV_BACKUP.enc -out .env`, then run `chmod 600 .env`. Never overwrite a working production `.env` without first saving it.

### Back up PostgreSQL

```bash
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > backups/postgres.dump
chmod 600 backups/postgres.dump
```

### Back up uploaded files

```bash
docker run --rm -v bonefree_uploads_data:/data:ro -v "$PWD/backups:/backup" alpine:3.23 tar -czf /backup/uploads.tar.gz -C /data .
chmod 600 backups/uploads.tar.gz
```

Copy the database dump, uploads archive, and encrypted environment backup to another secure location. A backup stored only on the VPS does not protect against losing the instance.

### Restore PostgreSQL

This procedure replaces the current database objects. Create another backup first and run it only during a maintenance window:

```bash
docker compose stop caddy api
docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < backups/postgres.dump
docker compose up -d
```

### Restore uploaded files

This command clears only the named `bonefree_uploads_data` volume and extracts the backup into it:

```bash
docker compose stop caddy api
docker run --rm -v bonefree_uploads_data:/data -v "$PWD/backups:/backup:ro" alpine:3.23 sh -c 'find /data -mindepth 1 -delete && tar -xzf /backup/uploads.tar.gz -C /data'
docker compose up -d
```

Restore the database and uploaded files from the same point in time to avoid inconsistent media references.

The upload commands use the Compose volume name `bonefree_uploads_data`, which matches the fixed project name in `compose.yaml`. Confirm it before backup or restore:

```bash
docker volume ls | grep bonefree_uploads_data
```

Never restore into an unidentified volume. After every restore, run `docker compose ps`, check the API logs, and call the health endpoint.

## 13. Troubleshooting

### The domain does not open

```bash
dig +short api.yourdomain.com A
sudo ss -lntup
docker compose ps
docker compose logs --tail=200 caddy
```

Confirm that DNS points to the VPS and that TCP ports 80 and 443 are open in both Oracle Cloud and Ubuntu.

### The application is unhealthy or keeps restarting

```bash
docker compose logs --tail=300 api
docker compose logs --tail=200 postgres redis
docker compose config --quiet
```

Common causes include an incomplete `.env`, a PostgreSQL password containing reserved URL characters, an incorrect CORS origin, an incompatible database, or unavailable Redis storage.

### A migration fails

```bash
docker compose logs --tail=400 api
docker compose ps
```

Do not delete the PostgreSQL volume and do not manually mark an Alembic migration as complete. Save the logs and database backup before attempting a repair. The application remains unavailable rather than starting against a partially migrated schema.

### The frontend reports `Failed to fetch`

- Open the browser developer tools and inspect the failed request URL.
- Confirm that it uses the public API address, for example `https://api.yourdomain.com`, not `localhost` or port `8000`.
- Confirm that the exact frontend origin appears in `CORS_ORIGINS`, including its scheme and subdomain.
- After changing `.env`, recreate the API with `docker compose up -d --force-recreate api`.
- Test `curl --fail --show-error https://api.yourdomain.com/health` from another computer.

### The frontend reports an organization or build error

- `domain_not_configured`: register the exact browser hostname with `add_organization_domain`, verify it, and test the public resolver. DNS alone does not register a tenant in the application.
- `deployment_tenant_mismatch`: compare the artifact's `build-manifest.json` with the slug returned by the public resolver. Publish the correct tenant artifact or the shared artifact; do not rename a tenant in the database to fit a mistaken deployment.
- `theme_not_in_build`: add the experience's theme to the tenant build target and rebuild, use the shared artifact, or intentionally change the remote experience to a theme present in the artifact.
- `experience_schema_incompatible`: deploy frontend and backend versions that support the same `experience_schema_version` before changing stored experience data.
- `feature_not_in_build` in the browser console: the backend enabled a capability that was pruned from this tenant artifact. Add the feature to its build target and rebuild, or disable that entitlement if it was enabled by mistake.

### The HTTPS certificate has not appeared

- Wait for DNS propagation.
- Confirm that the `A` record points to the correct IP address.
- Confirm TCP ports 80 and 443 in the Oracle Security List.
- Inspect `docker compose logs caddy`.
- Do not repeatedly request certificates for fake domains because certificate authorities enforce rate limits.

### Check resource usage

```bash
docker stats
df -h
docker system df
```

Press `Ctrl+C` to leave `docker stats`.

## Essential security rules

- Never publish ports 5432, 6379, or 8000.
- Never commit `.env`, database dumps, or backups.
- Restrict SSH to your IP address whenever possible and use a key instead of a password.
- Keep Ubuntu and the Docker images updated.
- Create regular backups and test the restoration procedure.
- Never use `docker compose down -v` in production.
- Never use the development test accounts in production.
- Never put `localhost`, private VPS addresses, or port `8000` in the production frontend API URL.
