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


@router.get("/me")
async def me(current_user=Depends(get_current_user)):
    return {"id": current_user.id, "name": current_user.name,
            "email": current_user.email, "role": current_user.role}


@router.get("")
async def list_users(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    users = await get_all_users(db)
    return [{"id": u.id, "name": u.name, "email": u.email,
             "role": u.role, "is_active": u.is_active} for u in users]


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
