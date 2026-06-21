from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from datetime import date
from app.core.database import get_db
from app.core.security import get_current_user
from app.services.work_log import get_logs, upsert_log

router = APIRouter(prefix="/work-logs", tags=["업무일지"])


class WorkLogUpsert(BaseModel):
    log_date: date
    content: str = ""
    issues: str = ""
    next_plan: str = ""


@router.get("")
async def list_logs(
    user_id: int | None = Query(None),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    target_user_id = user_id if (user_id and current_user.role == "admin") else current_user.id
    return await get_logs(db, target_user_id, from_date, to_date)


@router.post("")
async def save_log(body: WorkLogUpsert, db: AsyncSession = Depends(get_db),
                   current_user=Depends(get_current_user)):
    return await upsert_log(db, current_user.id, body.model_dump())
