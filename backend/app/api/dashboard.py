from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from datetime import datetime, timedelta
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.task import Task
from app.models.project import Project
from app.models.user import User

router = APIRouter(prefix="/dashboard", tags=["대시보드"])


@router.get("/summary")
async def summary(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    now = datetime.now()
    week_ago = now - timedelta(days=7)
    next_week = now + timedelta(days=7)

    # 지난 7일간 완료
    done_week = await db.scalar(
        select(func.count(Task.id)).where(
            Task.done_at >= week_ago, Task.status == "done"
        )
    )
    # 지난 7일간 생성
    created_week = await db.scalar(
        select(func.count(Task.id)).where(Task.created_at >= week_ago)
    )
    # 지난 7일간 업데이트 (done_at or created_at 기준 — 단순 근사)
    updated_week = await db.scalar(
        select(func.count(Task.id)).where(Task.created_at >= week_ago)
    )
    # 다음 7일 이내 마감
    due_soon = await db.scalar(
        select(func.count(Task.id)).where(
            Task.due_date != None,
            Task.due_date <= next_week.date(),
            Task.due_date >= now.date(),
            Task.status != "done"
        )
    )

    # 전체 태스크 상태별
    status_rows = (await db.execute(
        select(Task.status, func.count(Task.id)).group_by(Task.status)
    )).all()
    status_counts = {r[0]: r[1] for r in status_rows}

    # 우선순위별
    priority_rows = (await db.execute(
        select(Task.priority, func.count(Task.id)).group_by(Task.priority)
    )).all()
    priority_counts = {r[0]: r[1] for r in priority_rows}

    # 최근 활동 (최근 생성/완료된 태스크 10개)
    recent_tasks = (await db.execute(
        select(Task, User.name.label("creator_name"))
        .join(User, Task.created_by_id == User.id, isouter=True)
        .order_by(Task.created_at.desc())
        .limit(15)
    )).all()

    activities = []
    for row in recent_tasks:
        t, creator = row
        activities.append({
            "id": t.id,
            "type": "task_created",
            "title": t.title,
            "status": t.status,
            "priority": t.priority,
            "actor": creator or "알 수 없음",
            "ts": t.created_at.isoformat() if t.created_at else None,
        })

    return {
        "stats": {
            "done_week": done_week or 0,
            "created_week": created_week or 0,
            "due_soon": due_soon or 0,
        },
        "status_counts": status_counts,
        "priority_counts": priority_counts,
        "activities": activities,
    }
