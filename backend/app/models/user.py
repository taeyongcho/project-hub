from sqlalchemy import Integer, String, Boolean, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(50))
    email: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    role: Mapped[str] = mapped_column(String(20), default="member")  # admin / member / viewer
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    avatar_emoji: Mapped[str] = mapped_column(String(16), default="🙂")
    avatar_color: Mapped[str] = mapped_column(String(20), default="#3b82f6")
    created_at: Mapped[DateTime] = mapped_column(DateTime, server_default=func.now())

    tasks = relationship("Task", foreign_keys="Task.assigned_to_id", back_populates="assignee")
    work_logs = relationship("WorkLog", back_populates="user")
