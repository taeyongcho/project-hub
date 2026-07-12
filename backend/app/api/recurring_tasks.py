from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, Field
from datetime import date
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.recurring_task import RecurringTask
from app.models.user import User

router = APIRouter(prefix="/recurring-tasks", tags=["반복 할일"])

WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"]


class RecurringCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    priority: str = "normal"
    freq: str  # daily | weekly | monthly
    weekday: int | None = None
    month_day: int | None = None
    assigned_to_id: int | None = None
    project_id: int | None = None


def _r(r: RecurringTask, name_map: dict = None) -> dict:
    if r.freq == "daily":
        rule = "매일"
    elif r.freq == "weekly":
        rule = f"매주 {WEEKDAYS[r.weekday or 0]}요일"
    else:
        rule = f"매월 {r.month_day or 1}일"
    return {"id": r.id, "title": r.title, "priority": r.priority,
            "freq": r.freq, "weekday": r.weekday, "month_day": r.month_day,
            "rule_label": rule,
            "assigned_to_id": r.assigned_to_id,
            "assignee_name": (name_map or {}).get(r.assigned_to_id),
            "project_id": r.project_id, "active": r.active,
            "last_created": str(r.last_created) if r.last_created else None}


@router.get("")
async def list_rules(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    rows = (await db.execute(
        select(RecurringTask).where(RecurringTask.created_by_id == current_user.id)
        .order_by(RecurringTask.created_at.desc())
    )).scalars().all()
    users = (await db.execute(select(User))).scalars().all()
    name_map = {u.id: u.name for u in users}
    return [_r(r, name_map) for r in rows]


@router.post("")
async def create_rule(body: RecurringCreate, db: AsyncSession = Depends(get_db),
                      current_user=Depends(get_current_user)):
    if body.freq not in ("daily", "weekly", "monthly"):
        raise HTTPException(status_code=400, detail="freq는 daily/weekly/monthly")
    if body.freq == "weekly" and (body.weekday is None or not 0 <= body.weekday <= 6):
        raise HTTPException(status_code=400, detail="요일을 선택하세요")
    if body.freq == "monthly" and (body.month_day is None or not 1 <= body.month_day <= 31):
        raise HTTPException(status_code=400, detail="날짜(1~31)를 선택하세요")
    r = RecurringTask(**body.model_dump(), created_by_id=current_user.id)
    db.add(r)
    await db.commit()
    await db.refresh(r)
    return _r(r)


@router.patch("/{rule_id}/toggle")
async def toggle_rule(rule_id: int, db: AsyncSession = Depends(get_db),
                      current_user=Depends(get_current_user)):
    r = await db.get(RecurringTask, rule_id)
    if not r or r.created_by_id != current_user.id:
        raise HTTPException(status_code=404, detail="규칙을 찾을 수 없습니다")
    r.active = not r.active
    await db.commit()
    return {"ok": True, "active": r.active}


@router.delete("/{rule_id}")
async def delete_rule(rule_id: int, db: AsyncSession = Depends(get_db),
                      current_user=Depends(get_current_user)):
    r = await db.get(RecurringTask, rule_id)
    if not r or (r.created_by_id != current_user.id and current_user.role != "admin"):
        raise HTTPException(status_code=404, detail="규칙을 찾을 수 없습니다")
    await db.delete(r)
    await db.commit()
    return {"ok": True}


async def run_recurring(db: AsyncSession):
    """스케줄러용: 오늘 조건에 맞는 규칙으로 태스크 생성 (중복 방지)"""
    from app.services.task import create_task
    today = date.today()
    rows = (await db.execute(
        select(RecurringTask).where(RecurringTask.active == True)
    )).scalars().all()
    created = 0
    for r in rows:
        if r.last_created == today:
            continue
        due = (
            r.freq == "daily"
            or (r.freq == "weekly" and today.weekday() == (r.weekday or 0))
            or (r.freq == "monthly" and today.day == (r.month_day or 1))
        )
        if not due:
            continue
        await create_task(db, {
            "title": r.title, "priority": r.priority,
            "due_date": today, "assigned_to_id": r.assigned_to_id,
            "project_id": r.project_id,
            "description": f"🔁 반복 할일 자동 생성 ({_r(r)['rule_label']})",
        }, r.created_by_id)
        r.last_created = today
        created += 1
    await db.commit()
    return created
