from sqlalchemy import Integer, String, Date, ForeignKey, DateTime, func, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="todo")  # todo / in_progress / review / done
    priority: Mapped[str] = mapped_column(String(20), default="normal")  # urgent / high / normal / low
    due_date: Mapped[Date] = mapped_column(Date, nullable=True)
    done_at: Mapped[DateTime] = mapped_column(DateTime, nullable=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"), nullable=True)
    milestone_id: Mapped[int] = mapped_column(Integer, ForeignKey("milestones.id"), nullable=True)
    assigned_to_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    created_by_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))
    email_id: Mapped[int] = mapped_column(Integer, ForeignKey("emails.id"), nullable=True)
    parent_id: Mapped[int] = mapped_column(Integer, ForeignKey("tasks.id"), nullable=True)
    wbs_order: Mapped[int] = mapped_column(Integer, default=0)
    start_date: Mapped[Date] = mapped_column(Date, nullable=True)
    attachments: Mapped[list] = mapped_column(JSON, default=list)  # [{url,name,size,type}]
    created_at: Mapped[DateTime] = mapped_column(DateTime, server_default=func.now())

    project = relationship("Project", back_populates="tasks")
    milestone = relationship("Milestone", back_populates="tasks")
    assignee = relationship("User", foreign_keys=[assigned_to_id], back_populates="tasks")
    email = relationship("Email", back_populates="tasks")
    comments = relationship("Comment", back_populates="task", cascade="all, delete-orphan")
