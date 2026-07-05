from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.whiteboard import Whiteboard
from app.models.user import User


router = APIRouter(prefix="/whiteboards", tags=["화이트보드"])


class WhiteboardUpdate(BaseModel):
    name: str = None
    objects: list = None
    thumbnail: str = None


class WhiteboardCreate(BaseModel):
    name: str = "Untitled Board"
    project_id: int = None


class ShareUpdate(BaseModel):
    visibility: str  # 'shared' | 'private'
    shared_with: list = []


def _can_access(wb: Whiteboard, user: User) -> bool:
    if wb.created_by_id == user.id or user.role == "admin":
        return True
    if (wb.visibility or "shared") == "shared":
        return True
    return user.id in (wb.shared_with or [])


class WhiteboardResponse(BaseModel):
    id: int
    name: str
    objects: list
    created_by_id: int
    created_at: str
    updated_at: str


@router.get("")
async def list_whiteboards(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Whiteboard).order_by(Whiteboard.updated_at.desc())
    )
    boards = result.scalars().all()
    return [
        {
            "id": wb.id,
            "name": wb.name,
            "object_count": len(wb.objects) if isinstance(wb.objects, list) else 0,
            "thumbnail": wb.thumbnail,
            "project_id": wb.project_id,
            "visibility": wb.visibility or "shared",
            "shared_with": wb.shared_with or [],
            "created_by_id": wb.created_by_id,
            "created_at": str(wb.created_at),
            "updated_at": str(wb.updated_at)
        }
        for wb in boards if _can_access(wb, current_user)
    ]


@router.post("")
async def create_whiteboard(
    data: WhiteboardCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    wb = Whiteboard(
        name=data.name,
        project_id=data.project_id,
        created_by_id=current_user.id,
        objects=[]
    )
    db.add(wb)
    await db.commit()
    await db.refresh(wb)
    return {
        "id": wb.id,
        "name": wb.name,
        "objects": wb.objects,
        "created_by_id": wb.created_by_id,
        "created_at": str(wb.created_at),
        "updated_at": str(wb.updated_at)
    }


@router.get("/{whiteboard_id}")
async def get_whiteboard(
    whiteboard_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Whiteboard).where(Whiteboard.id == whiteboard_id)
    )
    wb = result.scalar_one_or_none()
    if not wb:
        raise HTTPException(status_code=404, detail="화이트보드를 찾을 수 없습니다")
    if not _can_access(wb, current_user):
        raise HTTPException(status_code=403, detail="이 보드에 접근 권한이 없습니다")
    return {
        "id": wb.id,
        "name": wb.name,
        "objects": wb.objects or [],
        "visibility": wb.visibility or "shared",
        "shared_with": wb.shared_with or [],
        "created_by_id": wb.created_by_id,
        "created_at": str(wb.created_at),
        "updated_at": str(wb.updated_at)
    }


@router.patch("/{whiteboard_id}/share")
async def update_share(
    whiteboard_id: int,
    data: ShareUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(Whiteboard).where(Whiteboard.id == whiteboard_id))
    wb = result.scalar_one_or_none()
    if not wb:
        raise HTTPException(status_code=404, detail="화이트보드를 찾을 수 없습니다")
    if wb.created_by_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="소유자만 공유 설정을 변경할 수 있습니다")
    wb.visibility = data.visibility
    wb.shared_with = data.shared_with
    await db.commit()
    return {"id": wb.id, "visibility": wb.visibility, "shared_with": wb.shared_with}


@router.patch("/{whiteboard_id}")
async def update_whiteboard(
    whiteboard_id: int,
    data: WhiteboardUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Whiteboard).where(Whiteboard.id == whiteboard_id)
    )
    wb = result.scalar_one_or_none()
    if not wb:
        raise HTTPException(status_code=404, detail="화이트보드를 찾을 수 없습니다")
    if not _can_access(wb, current_user):
        raise HTTPException(status_code=403, detail="이 보드를 편집할 권한이 없습니다")

    if data.name is not None:
        wb.name = data.name
    if data.objects is not None:
        wb.objects = data.objects
    if data.thumbnail is not None:
        wb.thumbnail = data.thumbnail

    await db.commit()
    await db.refresh(wb)
    return {
        "id": wb.id,
        "name": wb.name,
        "objects": wb.objects or [],
        "created_by_id": wb.created_by_id,
        "created_at": str(wb.created_at),
        "updated_at": str(wb.updated_at)
    }


@router.delete("/{whiteboard_id}")
async def delete_whiteboard(
    whiteboard_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Whiteboard).where(Whiteboard.id == whiteboard_id)
    )
    wb = result.scalar_one_or_none()
    if not wb:
        raise HTTPException(status_code=404, detail="화이트보드를 찾을 수 없습니다")
    if wb.created_by_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="소유자 또는 관리자만 삭제할 수 있습니다")

    await db.delete(wb)
    await db.commit()
    return {"message": "삭제됨"}
