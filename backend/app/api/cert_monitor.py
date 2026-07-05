from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.services import cert_monitor as svc

router = APIRouter(prefix="/cert-monitor", tags=["인증서 모니터링"])


class CertCreate(BaseModel):
    host: str
    label: str = ""
    port: int = 443


def _require_admin(user):
    if getattr(user, "role", None) != "admin":
        raise HTTPException(status_code=403, detail="관리자만 접근할 수 있습니다.")


@router.get("")
async def list_all(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    _require_admin(current_user)
    return await svc.list_certs(db)


@router.post("")
async def add(body: CertCreate, db: AsyncSession = Depends(get_db),
              current_user=Depends(get_current_user)):
    _require_admin(current_user)
    if not body.host.strip():
        raise HTTPException(status_code=400, detail="도메인을 입력하세요.")
    return await svc.add_cert(db, body.host, body.label, body.port, current_user.id)


@router.post("/{cert_id}/refresh")
async def refresh_one(cert_id: int, db: AsyncSession = Depends(get_db),
                      current_user=Depends(get_current_user)):
    _require_admin(current_user)
    result = await svc.refresh_cert(db, cert_id)
    if not result:
        raise HTTPException(status_code=404, detail="대상을 찾을 수 없습니다.")
    return result


@router.post("/refresh-all")
async def refresh_all(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    _require_admin(current_user)
    return await svc.refresh_all(db)


@router.delete("/{cert_id}")
async def delete(cert_id: int, db: AsyncSession = Depends(get_db),
                 current_user=Depends(get_current_user)):
    _require_admin(current_user)
    await svc.delete_cert(db, cert_id)
    return {"ok": True}
