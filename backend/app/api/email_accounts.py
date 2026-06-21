from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user, require_admin
from app.services.email_account import (
    list_accounts, create_account, update_account, delete_account,
    fetch_emails_pop3, send_email_smtp
)

router = APIRouter(prefix="/email-accounts", tags=["이메일 계정"])


class AccountCreate(BaseModel):
    name: str
    email: str
    username: str
    password: str
    pop3_host: str = ""
    pop3_port: int = 995
    pop3_ssl: bool = True
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_tls: bool = True


class AccountUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    username: str | None = None
    password: str | None = None
    pop3_host: str | None = None
    pop3_port: int | None = None
    pop3_ssl: bool | None = None
    smtp_host: str | None = None
    smtp_port: int | None = None
    smtp_tls: bool | None = None
    is_active: bool | None = None


class SendRequest(BaseModel):
    account_id: int
    to: str
    subject: str
    body: str
    cc: str = ""
    reply_to_msg_id: str = ""


@router.get("")
async def list_all(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    return await list_accounts(db)


@router.post("")
async def create(body: AccountCreate, db: AsyncSession = Depends(get_db),
                 current_user=Depends(require_admin)):
    data = body.model_dump()
    data["owner_id"] = current_user.id
    account = await create_account(db, data)
    from app.services.email_account import _a
    return _a(account)


@router.patch("/{account_id}")
async def update(account_id: int, body: AccountUpdate, db: AsyncSession = Depends(get_db),
                 _=Depends(require_admin)):
    account = await update_account(db, account_id, body.model_dump(exclude_none=True))
    if not account:
        raise HTTPException(status_code=404, detail="계정을 찾을 수 없습니다.")
    from app.services.email_account import _a
    return _a(account)


@router.delete("/{account_id}")
async def delete(account_id: int, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    await delete_account(db, account_id)
    return {"ok": True}


@router.post("/{account_id}/fetch")
async def fetch(account_id: int, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await fetch_emails_pop3(db, account_id)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/send")
async def send(body: SendRequest, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await send_email_smtp(
        body.account_id, db, body.to, body.subject, body.body, body.cc, body.reply_to_msg_id
    )
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result
