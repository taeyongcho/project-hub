from sqlalchemy import Column, Integer, String
from app.core.database import Base


class Organization(Base):
    """조직 단위 (본사 > 본부 > 팀 > 파트 트리)"""
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True)
    code = Column(String(50), unique=True, index=True)   # ORG1001 등
    name = Column(String(200))
    parent_code = Column(String(50), nullable=True)      # 상위 조직 code
    sort_order = Column(Integer, default=0)
