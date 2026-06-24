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


class WhiteboardCreate(BaseModel):
    name: str = "Untitled Board"
    project_id: int = None


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
    _=Depends(get_current_user)
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
            "created_by_id": wb.created_by_id,
            "created_at": str(wb.created_at),
            "updated_at": str(wb.updated_at)
        }
        for wb in boards
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
    _=Depends(get_current_user)
):
    result = await db.execute(
        select(Whiteboard).where(Whiteboard.id == whiteboard_id)
    )
    wb = result.scalar_one_or_none()
    if not wb:
        raise HTTPException(status_code=404, detail="화이트보드를 찾을 수 없습니다")
    return {
        "id": wb.id,
        "name": wb.name,
        "objects": wb.objects or [],
        "created_by_id": wb.created_by_id,
        "created_at": str(wb.created_at),
        "updated_at": str(wb.updated_at)
    }


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

    if data.name is not None:
        wb.name = data.name
    if data.objects is not None:
        wb.objects = data.objects

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

    await db.delete(wb)
    await db.commit()
    return {"message": "삭제됨"}
