from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import date
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.task import Task

router = APIRouter(prefix="/notifications", tags=["알림"])


@router.get("")
async def get_notifications(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    today = date.today()

    # 내 태스크 중 기한 초과
    overdue_rows = await db.execute(
        select(Task).where(
            Task.assigned_to_id == current_user.id,
            Task.status != "done",
            Task.due_date != None,
            Task.due_date < today
        ).order_by(Task.due_date.asc()).limit(20)
    )
    overdue = overdue_rows.scalars().all()

    # 오늘 마감
    due_today_rows = await db.execute(
        select(Task).where(
            Task.assigned_to_id == current_user.id,
            Task.status != "done",
            Task.due_date == today
        ).limit(10)
    )
    due_today = due_today_rows.scalars().all()

    items = []
    for t in overdue:
        diff = (today - t.due_date).days
        items.append({
            "id": t.id, "task_id": t.id, "title": t.title,
            "type": "overdue",
            "message": f"{diff}일 기한 초과",
            "due_date": str(t.due_date),
        })
    for t in due_today:
        items.append({
            "id": t.id, "task_id": t.id, "title": t.title,
            "type": "due_today",
            "message": "오늘 마감",
            "due_date": str(t.due_date),
        })

    return {"count": len(items), "items": items}
