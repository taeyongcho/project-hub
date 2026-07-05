from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import date, datetime
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.task import Task
from app.models.work_log import WorkLog

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

    # 업무일지 미작성 리마인더 (평일 오후 2시 이후)
    now = datetime.now()
    if now.weekday() < 5 and now.hour >= 14:
        log_today = await db.scalar(
            select(WorkLog.id).where(
                WorkLog.user_id == current_user.id,
                WorkLog.log_date == today
            )
        )
        if not log_today:
            items.append({
                "id": -1, "task_id": None, "title": "오늘 업무일지 미작성",
                "type": "worklog_reminder",
                "message": "오늘 업무일지를 작성해주세요",
                "due_date": str(today),
            })

    # 인증서 만료 임박/만료 (관리자 전용)
    if current_user.role == "admin":
        from app.services.cert_monitor import expiring_soon
        for c in await expiring_soon(db):
            dl = c["days_left"]
            if dl is not None and dl < 0:
                msg = f"인증서 만료됨 ({-dl}일 경과)"
            else:
                msg = f"인증서 만료 {dl}일 전"
            items.append({
                "id": 10000 + c["id"], "task_id": None,
                "title": f"🔒 {c['label']}",
                "type": "cert_expiry",
                "message": msg,
                "due_date": c["expires_at"],
            })

    return {"count": len(items), "items": items}
