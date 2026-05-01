"""
Drishti Poshan - User Auth ORM Model
"""
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String

from app.database import Base


class User(Base):
    """Anganwadi worker or supervisor user account."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(200), unique=True, nullable=False, index=True)
    password_hash = Column(String(300), nullable=False)
    pin_hash = Column(String(300), nullable=True, comment="Bcrypt-hashed 4-digit offline PIN")
    full_name = Column(String(200), nullable=False)
    role = Column(String(50), default="anganwadi_worker", comment="anganwadi_worker|supervisor")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<User(id={self.id}, username='{self.username}', role='{self.role}')>"
