from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.work_log import WorkLog


async def get_logs(db: AsyncSession, user_id: int, from_date=None, to_date=None):
    q = select(WorkLog).where(WorkLog.user_id == user_id)
    if from_date:
        q = q.where(WorkLog.log_date >= from_date)
    if to_date:
        q = q.where(WorkLog.log_date <= to_date)
    q = q.order_by(WorkLog.log_date.desc())
    result = await db.execute(q)
    return [_w(log) for log in result.scalars().all()]


async def upsert_log(db: AsyncSession, user_id: int, data: dict):
    log_date = data["log_date"]
    result = await db.execute(select(WorkLog).where(WorkLog.user_id == user_id, WorkLog.log_date == log_date))
    log = result.scalar_one_or_none()
    if log:
        for k, v in data.items():
            setattr(log, k, v)
    else:
        log = WorkLog(user_id=user_id, **data)
        db.add(log)
    await db.commit()
    await db.refresh(log)
    return _w(log)


def _w(log: WorkLog) -> dict:
    return {"id": log.id, "user_id": log.user_id, "log_date": str(log.log_date),
            "content": log.content, "issues": log.issues, "next_plan": log.next_plan,
            "updated_at": str(log.updated_at)}
