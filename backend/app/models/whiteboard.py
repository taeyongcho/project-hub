from sqlalchemy import Column, Integer, String, JSON, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base


class Whiteboard(Base):
    __tablename__ = "whiteboards"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), default="Untitled Board")
    description = Column(String(1000), nullable=True)
    objects = Column(JSON, default=list)  # 모든 그리기 오브젝트
    thumbnail = Column(String, nullable=True)  # base64 미리보기 이미지
    visibility = Column(String(20), default="shared")  # shared(전체) | private(지정)
    shared_with = Column(JSON, default=list)  # private일 때 접근 허용 user_id 목록
    project_id = Column(Integer, ForeignKey("projects.id"))
    created_by_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 관계
    project = relationship("Project", backref="whiteboards")
    created_by = relationship("User", backref="whiteboards")
