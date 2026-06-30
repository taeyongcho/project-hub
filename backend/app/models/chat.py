from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Index, JSON
from datetime import datetime
from app.core.database import Base


class ChatGroup(Base):
    __tablename__ = "chat_groups"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    member_ids = Column(JSON, default=list)  # 그룹 멤버 user_id 목록 (생성자 포함)
    created_by_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True)
    # 채널 키: "team" | "project:{id}" | "dm:{minId}-{maxId}"
    channel = Column(String(100), nullable=False, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False, default="")
    attachment = Column(JSON, nullable=True)  # {url, name, type, size}
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (Index("ix_chat_channel_created", "channel", "created_at"),)
