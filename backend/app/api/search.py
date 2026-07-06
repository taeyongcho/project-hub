from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.task import Task
from app.models.project import Project
from app.models.whiteboard import Whiteboard
from app.models.system_link import SystemLink
from app.models.email import Email
from app.models.work_log import WorkLog

router = APIRouter(prefix="/search", tags=["검색"])


@router.get("")
async def search(
    q: str = Query(..., min_length=1, max_length=200),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    q_like = f"%{q}%"

    task_rows = await db.execute(
        select(Task).where(
            or_(Task.title.ilike(q_like), Task.description.ilike(q_like))
        ).limit(10)
    )
    tasks = [
        {"id": t.id, "title": t.title, "status": t.status, "priority": t.priority,
         "project_id": t.project_id, "type": "task"}
        for t in task_rows.scalars().all()
    ]

    proj_rows = await db.execute(
        select(Project).where(Project.name.ilike(q_like)).limit(5)
    )
    projects = [
        {"id": p.id, "name": p.name, "color": p.color, "status": p.status, "type": "project"}
        for p in proj_rows.scalars().all()
    ]

    wb_rows = await db.execute(
        select(Whiteboard).where(Whiteboard.name.ilike(q_like)).limit(5)
    )
    whiteboards = [
        {"id": w.id, "name": w.name, "type": "whiteboard"}
        for w in wb_rows.scalars().all()
    ]

    link_rows = await db.execute(
        select(SystemLink).where(
            or_(SystemLink.name.ilike(q_like), SystemLink.url.ilike(q_like),
                SystemLink.description.ilike(q_like))
        ).limit(5)
    )
    system_links = [
        {"id": s.id, "name": s.name, "url": s.url, "type": "system_link"}
        for s in link_rows.scalars().all()
    ]

    # 이메일 (내 소유만)
    email_rows = await db.execute(
        select(Email).where(
            Email.owner_id == current_user.id,
            or_(Email.subject.ilike(q_like), Email.from_.ilike(q_like))
        ).order_by(Email.date_ts.desc().nullslast()).limit(5)
    )
    emails = [
        {"id": e.id, "subject": e.subject or "(제목없음)", "from_": e.from_,
         "status": e.status, "type": "email"}
        for e in email_rows.scalars().all()
    ]

    # 업무일지 (내 것만)
    wl_rows = await db.execute(
        select(WorkLog).where(
            WorkLog.user_id == current_user.id,
            or_(WorkLog.content.ilike(q_like), WorkLog.issues.ilike(q_like),
                WorkLog.next_plan.ilike(q_like))
        ).order_by(WorkLog.log_date.desc()).limit(5)
    )
    work_logs = [
        {"id": w.id, "log_date": str(w.log_date),
         "snippet": (w.content or "")[:60], "type": "work_log"}
        for w in wl_rows.scalars().all()
    ]

    return {"tasks": tasks, "projects": projects,
            "whiteboards": whiteboards, "system_links": system_links,
            "emails": emails, "work_logs": work_logs}
