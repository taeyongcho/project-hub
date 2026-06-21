from sqlalchemy import Integer, String, Float, ForeignKey, DateTime, func, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Email(Base):
    __tablename__ = "emails"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    path: Mapped[str] = mapped_column(String(500), unique=True, index=True)
    subject: Mapped[str] = mapped_column(String(500), default="")
    from_: Mapped[str] = mapped_column("from_addr", String(200), default="")
    to_: Mapped[str] = mapped_column("to_addr", String(500), default="")
    cc_: Mapped[str] = mapped_column("cc_addr", String(500), default="")
    date_str: Mapped[str] = mapped_column(String(100), default="")
    date_ts: Mapped[float] = mapped_column(Float, nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(20), default="unread")  # unread / pending / replied / done / waiting
    replied_at: Mapped[DateTime] = mapped_column(DateTime, nullable=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"), nullable=True)
    assigned_to_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    owner_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    account_id: Mapped[int] = mapped_column(Integer, ForeignKey("email_accounts.id"), nullable=True)
    added_at: Mapped[DateTime] = mapped_column(DateTime, server_default=func.now())

    project = relationship("Project", back_populates="emails")
    tasks = relationship("Task", back_populates="email")
    memos = relationship("Memo", back_populates="email", cascade="all, delete-orphan")
