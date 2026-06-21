from fastapi import APIRouter, Depends, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.services.email import (get_emails, get_email, update_email_status,
                                 import_eml_file, get_overdue_reply, add_memo, get_memos)

router = APIRouter(prefix="/emails", tags=["이메일"])


class StatusUpdate(BaseModel):
    status: str  # unread / pending / replied / done / waiting
    project_id: int | None = None
    assigned_to_id: int | None = None


class MemoCreate(BaseModel):
    content: str


@router.get("")
async def list_emails(
    status: str | None = Query(None),
    project_id: int | None = Query(None),
    assigned_to_id: int | None = Query(None),
    q: str | None = Query(None),
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user)
):
    return await get_emails(db, status=status, project_id=project_id,
                            assigned_to_id=assigned_to_id, q=q, skip=skip, limit=limit)


@router.get("/overdue-reply")
async def overdue_reply(days: int = Query(2), db: AsyncSession = Depends(get_db),
                        _=Depends(get_current_user)):
    return await get_overdue_reply(db, days)


@router.get("/{email_id}")
async def get_one(email_id: int, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    return await get_email(db, email_id)


@router.patch("/{email_id}/status")
async def set_status(email_id: int, body: StatusUpdate, db: AsyncSession = Depends(get_db),
                     _=Depends(get_current_user)):
    return await update_email_status(db, email_id, body.model_dump(exclude_none=True))


@router.post("/import")
async def import_eml(file: UploadFile = File(...), db: AsyncSession = Depends(get_db),
                     current_user=Depends(get_current_user)):
    content = await file.read()
    return await import_eml_file(db, content, file.filename)


@router.get("/{email_id}/memos")
async def list_memos(email_id: int, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    return await get_memos(db, email_id)


@router.post("/{email_id}/memos")
async def create_memo(email_id: int, body: MemoCreate, db: AsyncSession = Depends(get_db),
                      current_user=Depends(get_current_user)):
    return await add_memo(db, email_id, current_user.id, body.content)
