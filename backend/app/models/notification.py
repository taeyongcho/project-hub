from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from datetime import datetime
from app.core.database import Base


class Notification(Base):
    """저장형 이벤트 알림 (배정, 댓글 등)"""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)   # 수신자
    type = Column(String(40))                # task_assigned | task_comment
    title = Column(String(300))              # 대상 제목 (태스크 제목 등)
    message = Column(String(300))            # 표시 문구
    task_id = Column(Integer, nullable=True) # 클릭 시 이동할 태스크
    actor_id = Column(Integer, nullable=True)
    is_read = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
