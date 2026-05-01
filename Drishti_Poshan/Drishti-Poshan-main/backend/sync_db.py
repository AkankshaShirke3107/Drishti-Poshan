"""
Drishti Poshan — Surgical Database Repair Script
Run this ONCE to add missing columns to an existing SQLite database.

Usage:
    cd Backend
    python sync_db.py

Safe to run multiple times — it checks before altering.
"""
import sqlite3
import os
import sys

# ─── Configuration ──────────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(__file__), "drishti.db")

# Columns to ensure exist: (table, column, sql_type, default)
MIGRATIONS = [
    ("children", "village",     "TEXT",     None),
    ("children", "is_deleted",  "BOOLEAN",  "0"),
    ("children", "deleted_at",  "DATETIME", None),
]

# Users table (for auth) — created fresh if missing
USERS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(200) NOT NULL UNIQUE,
    password_hash VARCHAR(300) NOT NULL,
    full_name VARCHAR(200) NOT NULL,
    role VARCHAR(50) DEFAULT 'anganwadi_worker',
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
"""


def get_existing_columns(cursor, table_name):
    """Get set of column names for a given table."""
    cursor.execute(f"PRAGMA table_info({table_name})")
    return {row[1] for row in cursor.fetchall()}


def table_exists(cursor, table_name):
    """Check if a table exists in the database."""
    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table_name,),
    )
    return cursor.fetchone() is not None


def run_migrations():
    if not os.path.exists(DB_PATH):
        print(f"⚠  Database not found at: {DB_PATH}")
        print("   Start the FastAPI server first to create it, then re-run this script.")
        print("   Or use the 'Clean Reset' option below.")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    changes = 0

    print(f"🔍 Database: {DB_PATH}")
    print(f"   Size: {os.path.getsize(DB_PATH) / 1024:.1f} KB\n")

    # ─── Step 1: Add missing columns to existing tables ─────────
    for table, column, sql_type, default in MIGRATIONS:
        if not table_exists(cursor, table):
            print(f"⚠  Table '{table}' does not exist — skipping column '{column}'")
            continue

        existing = get_existing_columns(cursor, table)

        if column in existing:
            print(f"✓  {table}.{column} — already exists")
        else:
            default_clause = f" DEFAULT {default}" if default is not None else ""
            sql = f"ALTER TABLE {table} ADD COLUMN {column} {sql_type}{default_clause}"
            try:
                cursor.execute(sql)
                print(f"✅ {table}.{column} — ADDED ({sql_type}{default_clause})")
                changes += 1
            except sqlite3.OperationalError as e:
                if "duplicate column" in str(e).lower():
                    print(f"✓  {table}.{column} — already exists (caught duplicate)")
                else:
                    print(f"❌ {table}.{column} — ERROR: {e}")

    # ─── Step 2: Ensure users table exists ──────────────────────
    if not table_exists(cursor, "users"):
        cursor.execute(USERS_TABLE_SQL)
        print(f"\n✅ 'users' table — CREATED")
        changes += 1
    else:
        print(f"\n✓  'users' table — already exists")

    # ─── Step 3: Verify final schema ────────────────────────────
    print("\n─── Final Schema Verification ───")
    for table_name in ["children", "users"]:
        if table_exists(cursor, table_name):
            cols = get_existing_columns(cursor, table_name)
            print(f"   {table_name}: {', '.join(sorted(cols))}")

    conn.commit()
    conn.close()

    if changes > 0:
        print(f"\n🎉 Done! Applied {changes} migration(s). Restart your FastAPI server.")
    else:
        print(f"\n✓  Database is already up to date. No changes needed.")


if __name__ == "__main__":
    print("═" * 55)
    print("  Drishti Poshan — Database Sync Script")
    print("═" * 55 + "\n")
    run_migrations()
