import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from settings import DATA

def now():
    return datetime.now(timezone.utc).isoformat()

@contextmanager
def db(write=False):
    conn = sqlite3.connect(DATA / "mercury.sqlite3", timeout=15)
    conn.row_factory = sqlite3.Row
    try:
        if write:
            conn.execute("BEGIN IMMEDIATE")
        yield conn
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        conn.close()

def init():
    with db() as c:
        c.executescript("""
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS run (
          id TEXT PRIMARY KEY, created TEXT NOT NULL, started TEXT, ended TEXT,
          state TEXT NOT NULL, checkpoint INTEGER NOT NULL DEFAULT 0,
          stage TEXT NOT NULL DEFAULT 'Validación', error TEXT, detail TEXT NOT NULL DEFAULT '{}',
          files TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'load'
        );
        CREATE UNIQUE INDEX IF NOT EXISTS only_one_active ON run((1))
          WHERE state IN ('EN_COLA','EN_PROCESO');
        CREATE TABLE IF NOT EXISTS version (layer TEXT PRIMARY KEY, run_id TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS publication (
          id INTEGER PRIMARY KEY CHECK (id=1), published TEXT NOT NULL, programs INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS dashboard (id TEXT PRIMARY KEY, config TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS result (
          id TEXT PRIMARY KEY, created TEXT NOT NULL, config TEXT NOT NULL
        );
        """)

def run_record(row):
    return dict(row) | {"files": json.loads(row["files"]), "detail": json.loads(row["detail"])}

def versions(c):
    return dict(c.execute("SELECT layer,run_id FROM version").fetchall())
