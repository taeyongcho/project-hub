from sqlalchemy import Column, Integer, String, Boolean, Date, DateTime, ForeignKey
from datetime import datetime
from app.core.database import Base


class RecurringTask(Base):
    """반복 할일 규칙 — 스케줄러가 매일 아침 조건에 맞으면 실제 태스크 생성"""
    __tablename__ = "recurring_tasks"

    id = Column(Integer, primary_key=True)
    title = Column(String(300), nullable=False)
    priority = Column(String(20), default="normal")
    freq = Column(String(10), nullable=False)      # daily | weekly | monthly
    weekday = Column(Integer, nullable=True)        # weekly: 0=월 ~ 6=일
    month_day = Column(Integer, nullable=True)      # monthly: 1~31
    assigned_to_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    active = Column(Boolean, default=True)
    last_created = Column(Date, nullable=True)      # 마지막 생성일 (중복 방지)
    created_by_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
