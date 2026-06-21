from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.task import Task
from app.models.project import Project

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

    return {"tasks": tasks, "projects": projects}
