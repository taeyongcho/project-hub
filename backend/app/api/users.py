from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr
from app.core.database import get_db
from app.core.security import get_current_user, require_admin, hash_password
from app.services.user import get_all_users, get_user_by_email, create_user, update_user, deactivate_user

router = APIRouter(prefix="/users", tags=["사용자"])


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "member"


class UserUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    is_active: bool | None = None


class ProfileUpdate(BaseModel):
    name: str | None = None
    avatar_emoji: str | None = None
    avatar_color: str | None = None


def _u(u):
    return {"id": u.id, "name": u.name, "email": u.email, "role": u.role,
            "avatar_emoji": getattr(u, "avatar_emoji", "🙂"), "avatar_color": getattr(u, "avatar_color", "#3b82f6")}


@router.get("/me")
async def me(current_user=Depends(get_current_user)):
    return _u(current_user)


@router.patch("/me/profile")
async def update_profile(body: ProfileUpdate, db: AsyncSession = Depends(get_db),
                         current_user=Depends(get_current_user)):
    if body.name is not None and body.name.strip():
        current_user.name = body.name.strip()[:50]
    if body.avatar_emoji is not None:
        current_user.avatar_emoji = body.avatar_emoji[:16]
    if body.avatar_color is not None:
        current_user.avatar_color = body.avatar_color[:20]
    await db.commit()
    await db.refresh(current_user)
    return _u(current_user)


@router.get("")
async def list_users(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    users = await get_all_users(db)
    return [{**_u(u), "is_active": u.is_active} for u in users]


@router.post("")
async def invite_user(body: UserCreate, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    if await get_user_by_email(db, body.email):
        raise HTTPException(status_code=400, detail="이미 존재하는 이메일입니다.")
    user = await create_user(db, body.name, body.email, hash_password(body.password), body.role)
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role}


@router.patch("/{user_id}")
async def edit_user(user_id: int, body: UserUpdate, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    user = await update_user(db, user_id, body.model_dump(exclude_none=True))
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    return {"id": user.id, "name": user.name, "role": user.role, "is_active": user.is_active}


@router.delete("/{user_id}")
async def remove_user(user_id: int, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    await deactivate_user(db, user_id)
    return {"ok": True}
