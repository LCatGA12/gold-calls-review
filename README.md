# Gold Calls Review

Standalone reviewer site for the forty gold calls: one private link per reviewer (`/r/<token>`), one write-once note per turn, admin page at `/admin?key=<ADMIN_KEY>` for links, progress and the CSV.

Run locally: `pip install -r requirements.txt && uvicorn app:app --port 8011` (SQLite file). On Render set `DATABASE_URL` (Postgres) and `ADMIN_KEY`.
