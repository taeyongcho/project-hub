from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from datetime import datetime
from app.core.database import Base


class SystemLink(Base):
    __tablename__ = "system_links"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)        # 시스템 이름
    url = Column(String(500), nullable=False)         # http://ip:port
    description = Column(String(1000), nullable=True) # 설명/메모
    category = Column(String(100), default="기타")     # 분류 (개발/테스트/운영 등)
    environment = Column(String(50), default="test")  # dev / test / staging / prod
    created_by_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
