from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from datetime import datetime
from app.core.database import Base


class MonitoredCert(Base):
    """SSL 인증서 만료 모니터링 대상"""
    __tablename__ = "monitored_certs"

    id = Column(Integer, primary_key=True)
    host = Column(String(255), nullable=False)          # 도메인 (예: hub.afg.kr)
    label = Column(String(255), nullable=True)          # 표시용 이름
    port = Column(Integer, default=443)
    expires_at = Column(DateTime, nullable=True)        # 인증서 만료일 (UTC naive)
    issuer = Column(String(500), nullable=True)         # 발급자
    last_checked = Column(DateTime, nullable=True)
    last_error = Column(String(500), nullable=True)     # 확인 실패 사유
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
