import time
import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.system_link import SystemLink
from app.models.user import User


router = APIRouter(prefix="/system-links", tags=["시스템 바로가기"])


class LinkIn(BaseModel):
    name: str
    url: str
    description: str | None = None
    category: str | None = "기타"
    environment: str | None = "test"
    project_id: int | None = None


def _serialize(l: SystemLink) -> dict:
    return {
        "id": l.id,
        "name": l.name,
        "url": l.url,
        "description": l.description,
        "category": l.category,
        "environment": l.environment,
        "project_id": l.project_id,
        "created_by_id": l.created_by_id,
        "updated_at": str(l.updated_at),
    }


@router.get("")
async def list_links(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(select(SystemLink).order_by(SystemLink.category, SystemLink.name))
    return [_serialize(l) for l in result.scalars().all()]


@router.get("/{link_id}/check")
async def check_link(link_id: int, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(select(SystemLink).where(SystemLink.id == link_id))
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="찾을 수 없습니다")
    start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=5.0, verify=False, follow_redirects=True) as client:
            resp = await client.get(link.url)
        ms = int((time.monotonic() - start) * 1000)
        # 응답이 오면(에러코드라도) 서버는 살아있는 것으로 간주
        return {"id": link_id, "status": "up", "code": resp.status_code, "ms": ms}
    except Exception as e:
        return {"id": link_id, "status": "down", "error": type(e).__name__}


@router.post("")
async def create_link(data: LinkIn, db: AsyncSession = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    link = SystemLink(**data.model_dump(), created_by_id=current_user.id)
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return _serialize(link)


@router.patch("/{link_id}")
async def update_link(link_id: int, data: LinkIn, db: AsyncSession = Depends(get_db),
                      _=Depends(get_current_user)):
    result = await db.execute(select(SystemLink).where(SystemLink.id == link_id))
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="찾을 수 없습니다")
    for k, v in data.model_dump().items():
        setattr(link, k, v)
    await db.commit()
    await db.refresh(link)
    return _serialize(link)


@router.delete("/{link_id}")
async def delete_link(link_id: int, db: AsyncSession = Depends(get_db),
                      _=Depends(get_current_user)):
    result = await db.execute(select(SystemLink).where(SystemLink.id == link_id))
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="찾을 수 없습니다")
    await db.delete(link)
    await db.commit()
    return {"message": "삭제됨"}
