from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.task import Task
from app.models.project import Project
from app.models.whiteboard import Whiteboard
from app.models.system_link import SystemLink

router = APIRouter(prefix="/search", tags=["검색"])


@router.get("")
async def search(
    q: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user)
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

    return {"tasks": tasks, "projects": projects,
            "whiteboards": whiteboards, "system_links": system_links}
