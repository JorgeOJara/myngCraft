# MyngCraft 2.0

A lightweight Bun + Express storefront created to replace the WordPress site at Myng's Crafts. It includes a responsive shop, customer accounts, favorites, a saved bag, order tracking and conversations, contact forms, SQLite storage, product image uploads, and a deliberately simple owner dashboard.

## Run it

```bash
cp .env.example .env
bun install
bun run start
```

Open `http://localhost:1010`. The owner area is at `http://localhost:1010/admin`.

On the MyngCraft server, the included Docker Compose service is published only on `127.0.0.1:8080` for the `myngcrafts.com` Nginx virtual host. Port 1010 is internal to the container and is not exposed directly. The application inside the container is still Bun + Express and starts with `bun run start`:

```bash
docker compose up -d --build
```

## Owner workflow

1. Sign in with the password from `ADMIN_PASSWORD`.
2. Choose **Add a new item**.
3. Add one photo, a name, price, category, and quantity.
4. Turn on **Show this item in the shop** and save.

The owner can also open **Orders** to move an order through Order received, In process, Working on it, Sent, and Delivered. Messages attached to an order stay with that order, so the owner and customer can read and reply in the same conversation. **Customers** shows account and order-history summaries.

## Customer workflow

1. Use **Sign in** in the shop header to create an account or return to an existing one.
2. Tap the heart on an item to keep it in **Favorites**.
3. Bag contents are saved to the account and restored on later visits or another device.
4. **My orders** shows current status, past orders, delivery details, and messages from the owner.
5. **My information** lets the customer update contact and delivery details or change their password.

Orders placed through the checkout are saved in `data/myngcraft.sqlite`. The site records order requests and inventory; it does not charge a credit card. A payment provider can be connected once the owner's preferred provider is chosen.

## Data and backups

- Database: `data/myngcraft.sqlite`
- Uploaded product photos: `public/uploads/`
- Back up both locations together.
- The app creates its schema and starter content automatically on first run.

## Production notes

- Production startup is refused unless `ADMIN_PASSWORD` is at least 14 characters, `SESSION_SECRET` is at least 32 private characters, and `COOKIE_SECURE=true`.
- Keep `.env`, `data/`, backups, and `public/uploads/` out of Git. Back them up through a private channel.
- Nginx terminates HTTPS and the Compose service binds only to `127.0.0.1:8080`; container port 1010 must not be published publicly.
- Customer passwords use Bun's password hashing. Signed customer sessions are revocable and rotate after a password change or sign-out.
- Authenticated forms use CSRF tokens. Unsafe cross-origin requests are rejected, private pages are marked `no-store`, sign-in and public-write endpoints are rate limited, and uploaded images are checked by file signature before being saved.
- The production container runs as a non-root user with a read-only root filesystem, no Linux capabilities, bounded memory/processes, persistent data mounts, and `restart: unless-stopped`.
