from sqlalchemy import Integer, String, ForeignKey, DateTime, func, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    type: Mapped[str] = mapped_column(String(20))  # weekly / monthly
    period: Mapped[str] = mapped_column(String(20), index=True)  # 2026-W25 / 2026-06
    content: Mapped[dict] = mapped_column(JSON, default={})
    created_by_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))
    generated_at: Mapped[DateTime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
