"""
Drishti Poshan - Database Engine (SQLAlchemy Async + SQLite)
"""
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import DATABASE_URL

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""
    pass


async def get_db():
    """FastAPI dependency: yields an async DB session."""
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db():
    """Create all tables on startup + migrate missing columns."""
    async with engine.begin() as conn:
        from app.models import child  # noqa: F401 — ensure models registered
        from app.models import auth   # noqa: F401 — ensure auth model registered

        # Create any brand-new tables (observations, auth, etc.)
        await conn.run_sync(Base.metadata.create_all)

        # ── Inline migration: add missing columns to existing tables ──
        # SQLAlchemy create_all does NOT add new columns to existing tables.
        # These ALTER TABLE statements are idempotent (fail silently if column exists).
        migrations = [
            "ALTER TABLE children ADD COLUMN status VARCHAR(20) DEFAULT 'NORMAL'",
            "ALTER TABLE measurements ADD COLUMN status VARCHAR(20) DEFAULT 'NORMAL'",
            "ALTER TABLE users ADD COLUMN pin_hash VARCHAR(300)",
            # Clinical vitals for WHO Complicated SAM triage
            "ALTER TABLE children ADD COLUMN hemoglobin_g_dl FLOAT",
            "ALTER TABLE children ADD COLUMN severe_palmar_pallor BOOLEAN DEFAULT FALSE",
            "ALTER TABLE children ADD COLUMN temperature_celsius FLOAT",
            "ALTER TABLE children ADD COLUMN breaths_per_minute INTEGER",
        ]
        import logging
        logger = logging.getLogger("drishti.db")
        for sql in migrations:
            try:
                await conn.execute(text(sql))
                logger.info(f"Migration applied: {sql.split('ADD COLUMN')[1].strip().split()[0]}")
            except Exception:
                pass  # Column already exists — expected on subsequent startups
