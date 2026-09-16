"""Gold Calls Review — standalone reviewer site.

Each reviewer gets a link with a private token (/r/<token>). Notes are one per (reviewer, call, turn),
write-once. Admin endpoints (key in ADMIN_KEY) mint tokens, show progress, and export CSV.
Storage: Postgres when DATABASE_URL is set (Render), else a local SQLite file (dev).
"""
import csv, io, json, os, secrets, sqlite3, datetime
from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse, StreamingResponse
from pydantic import BaseModel

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = json.load(open(os.path.join(HERE, "calls.json"), encoding="utf-8"))
PAGE = open(os.path.join(HERE, "static", "review.html"), encoding="utf-8").read()
ADMIN_PAGE = open(os.path.join(HERE, "static", "admin.html"), encoding="utf-8").read()
ADMIN_KEY = os.environ.get("ADMIN_KEY", "")
DATABASE_URL = os.environ.get("DATABASE_URL", "")
TOTAL_TURNS = sum(1 for c in DATA["calls"] for t in c["turns"] if t.get("alex") is not None and not t.get("hangup"))

app = FastAPI(title="Gold Calls Review")


# ---------- storage ----------
class DB:
    def __init__(self):
        self.pg = bool(DATABASE_URL)
        if self.pg:
            import psycopg
            self.psycopg = psycopg
        self.path = os.path.join(HERE, "notes.sqlite")
        self.init()

    def conn(self):
        if self.pg:
            return self.psycopg.connect(DATABASE_URL, autocommit=True)
        c = sqlite3.connect(self.path); c.row_factory = sqlite3.Row; return c

    def q(self, sql, args=()):
        if not self.pg:
            sql = sql.replace("%s", "?")
        with self.conn() as c:
            cur = c.execute(sql, args)
            try:
                rows = cur.fetchall()
            except Exception:
                rows = []
            if self.pg and rows and cur.description:
                cols = [d[0] for d in cur.description]
                rows = [dict(zip(cols, r)) for r in rows]
            elif not self.pg:
                rows = [dict(r) for r in rows]
            if not self.pg:
                c.commit()
            return rows

    def init(self):
        self.q("""CREATE TABLE IF NOT EXISTS reviewers (token TEXT PRIMARY KEY, label TEXT, name TEXT, created_at TEXT, last_seen TEXT)""")
        self.q("""CREATE TABLE IF NOT EXISTS notes (token TEXT, call TEXT, turn INTEGER, verdict TEXT, text TEXT, saved_at TEXT,
                  PRIMARY KEY (token, call, turn))""")


db = DB()
now = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def reviewer(token):
    r = db.q("SELECT token, label, name FROM reviewers WHERE token=%s", (token,))
    if not r:
        raise HTTPException(404, "This link is not valid. Ask for a fresh one.")
    db.q("UPDATE reviewers SET last_seen=%s WHERE token=%s", (now(), token))
    return r[0]


def admin(key):
    if not ADMIN_KEY or key != ADMIN_KEY:
        raise HTTPException(403, "admin key required")


# ---------- reviewer side ----------
@app.get("/healthz", response_class=PlainTextResponse)
def healthz():
    return "ok"


@app.get("/", response_class=HTMLResponse)
def root():
    return "<title>Gold Calls Review</title><p style='font-family:sans-serif;padding:40px'>This review site works from a personal link. Ask the team for yours.</p>"


@app.get("/r/{token}", response_class=HTMLResponse)
def review_page(token: str):
    r = reviewer(token)
    boot = {"token": token, "name": r.get("name") or "", "label": r.get("label") or "", "total": TOTAL_TURNS}
    html = PAGE.replace("/*__DATA__*/null", json.dumps(DATA, ensure_ascii=False)).replace("/*__BOOT__*/null", json.dumps(boot))
    return HTMLResponse(html)


@app.get("/api/me")
def me(token: str):
    r = reviewer(token)
    notes = db.q("SELECT call, turn, verdict, text, saved_at FROM notes WHERE token=%s", (token,))
    return {"name": r.get("name") or "", "notes": notes, "total": TOTAL_TURNS}


class NameIn(BaseModel):
    token: str
    name: str


@app.post("/api/name")
def set_name(body: NameIn):
    reviewer(body.token)
    name = body.name.strip()[:80]
    if not name:
        raise HTTPException(400, "name required")
    db.q("UPDATE reviewers SET name=%s WHERE token=%s", (name, body.token))
    return {"ok": True, "name": name}


class NoteIn(BaseModel):
    token: str
    call: str
    turn: int
    verdict: str = ""
    text: str = ""


@app.post("/api/note")
def save_note(body: NoteIn):
    reviewer(body.token)
    if body.verdict not in ("", "ok", "voice", "wrong"):
        raise HTTPException(400, "bad verdict")
    text = body.text.strip()[:8000]
    if not body.verdict and not text:
        raise HTTPException(400, "empty note")
    if not any(c["id"] == body.call for c in DATA["calls"]):
        raise HTTPException(400, "unknown call")
    existing = db.q("SELECT saved_at FROM notes WHERE token=%s AND call=%s AND turn=%s", (body.token, body.call, body.turn))
    if existing:
        raise HTTPException(409, "already saved")
    db.q("INSERT INTO notes (token, call, turn, verdict, text, saved_at) VALUES (%s,%s,%s,%s,%s,%s)",
         (body.token, body.call, body.turn, body.verdict, text, now()))
    return {"ok": True, "saved_at": now()}


# ---------- admin side ----------
@app.get("/admin", response_class=HTMLResponse)
def admin_page(key: str = ""):
    admin(key)
    return HTMLResponse(ADMIN_PAGE.replace("/*__KEY__*/null", json.dumps(key)).replace("/*__DATA__*/null", json.dumps(DATA, ensure_ascii=False)))


@app.post("/admin/tokens")
def mint(key: str, n: int = 1, label: str = ""):
    admin(key)
    out = []
    for i in range(max(1, min(n, 200))):
        t = secrets.token_urlsafe(9)
        db.q("INSERT INTO reviewers (token, label, name, created_at, last_seen) VALUES (%s,%s,%s,%s,%s)", (t, label, "", now(), ""))
        out.append(t)
    return {"tokens": out}


@app.get("/admin/progress")
def progress(key: str):
    admin(key)
    revs = db.q("SELECT token, label, name, created_at, last_seen FROM reviewers ORDER BY created_at")
    counts = db.q("SELECT token, COUNT(*) AS n, SUM(CASE WHEN verdict='ok' THEN 1 ELSE 0 END) AS ok, SUM(CASE WHEN verdict='voice' THEN 1 ELSE 0 END) AS voice, SUM(CASE WHEN verdict='wrong' THEN 1 ELSE 0 END) AS wrong, MAX(saved_at) AS last FROM notes GROUP BY token")
    by = {c["token"]: c for c in counts}
    for r in revs:
        c = by.get(r["token"], {})
        r.update({"n": int(c.get("n") or 0), "ok": int(c.get("ok") or 0), "voice": int(c.get("voice") or 0), "wrong": int(c.get("wrong") or 0), "last": c.get("last") or ""})
    return {"total": TOTAL_TURNS, "reviewers": revs}


@app.get("/admin/notes")
def notes_json(key: str):
    admin(key)
    return db.q("SELECT n.token, r.name, r.label, n.call, n.turn, n.verdict, n.text, n.saved_at FROM notes n LEFT JOIN reviewers r ON r.token=n.token ORDER BY r.name, n.call, n.turn")


@app.get("/admin/notes.csv")
def notes_csv(key: str):
    admin(key)
    rows = notes_json(key)
    turns = {(c["id"], t["n"]): t for c in DATA["calls"] for t in c["turns"]}
    buf = io.StringIO(); w = csv.writer(buf)
    w.writerow(["reviewer", "label", "token", "call", "turn", "verdict", "note", "saved_at", "mom_line", "alex_line"])
    for r in rows:
        t = turns.get((r["call"], r["turn"]), {})
        w.writerow([r.get("name") or "", r.get("label") or "", r["token"], r["call"], r["turn"], r["verdict"] or "", r["text"] or "", r["saved_at"], t.get("mom", ""), t.get("alex", "")])
    data = "﻿" + buf.getvalue()
    return StreamingResponse(iter([data]), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=gold_call_notes.csv"})
