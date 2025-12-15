MyriamCraft Docker Setup
========================

Production-focused Docker Compose for WordPress + MariaDB.

Quick start
-----------

- Copy `.env.example` to `.env` and adjust non-sensitive values.
- Create Docker secrets for DB passwords:
  - Write strong secrets into:
    - `secrets/mysql_root_password`
    - `secrets/mysql_password`
- Start the stack:
  - `docker compose pull` (recommended to pre-pull pinned images)
  - `docker compose up -d`
- Initialize WordPress (optional helper):
  - `scripts/setup.sh`

Notes for production
--------------------

- Passwords are sourced via Docker secrets (`*_FILE` env variants).
- WordPress cron is disabled in-app and handled by the `wpcron` sidecar.
- Images are pinned via overridable env (`WORDPRESS_IMAGE`, `DB_IMAGE`).
- phpMyAdmin is restricted to the `dev` profile:
  - Run it only for troubleshooting: `docker compose --profile dev up -d phpmyadmin`
- Expose WordPress behind a reverse proxy with TLS in production; the `ports` mapping is for local/dev.
- Logs rotate with `json-file` driver (`10m` × `5`). Consider central logging in larger deployments.

Security hardening
------------------

- Constants set in `WORDPRESS_CONFIG_EXTRA`:
  - `WP_ENVIRONMENT_TYPE=production`, `DISALLOW_FILE_EDIT`, `AUTOMATIC_UPDATER_DISABLED`, `WP_CACHE`, `WP_POST_REVISIONS` limit.
- MariaDB hardened in `my.cnf` (e.g., `skip-name-resolve`, utf8mb4 defaults) and compatible with MariaDB 11.

Useful commands
---------------

- Run WP-CLI: `docker compose run --rm wpcli <args>`
- Check DB health: `docker compose ps` (health column) or logs: `docker compose logs db`

