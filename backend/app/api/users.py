from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr
from app.core.database import get_db
from app.core.security import get_current_user, require_admin, hash_password, verify_password
from app.services.user import get_all_users, get_user_by_email, get_user_by_id, create_user, update_user, deactivate_user

router = APIRouter(prefix="/users", tags=["사용자"])


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    employee_no: str          # 사번 — 초기 비밀번호로 사용
    role: str = "member"


class UserUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    is_active: bool | None = None


class ProfileUpdate(BaseModel):
    name: str | None = None
    avatar_emoji: str | None = None
    avatar_color: str | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


def _u(u):
    return {"id": u.id, "name": u.name, "email": u.email, "role": u.role,
            "employee_no": getattr(u, "employee_no", None),
            "must_change_password": bool(getattr(u, "must_change_password", False)),
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


@router.patch("/me/password")
async def change_password(body: PasswordChange, db: AsyncSession = Depends(get_db),
                         current_user=Depends(get_current_user)):
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="현재 비밀번호가 올바르지 않습니다")
    if len(body.new_password) < 1:
        raise HTTPException(status_code=400, detail="새 비밀번호를 입력하세요")
    current_user.password_hash = hash_password(body.new_password)
    current_user.must_change_password = False
    await db.commit()
    return {"ok": True}


@router.get("")
async def list_users(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    users = await get_all_users(db)
    return [{**_u(u), "is_active": u.is_active} for u in users]


@router.post("")
async def invite_user(body: UserCreate, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    if await get_user_by_email(db, body.email):
        raise HTTPException(status_code=400, detail="이미 존재하는 이메일입니다.")
    emp_no = body.employee_no.strip()
    if not emp_no:
        raise HTTPException(status_code=400, detail="사번을 입력하세요.")
    # 초기 비밀번호 = 사번, 최초 로그인 시 변경 강제
    user = await create_user(db, body.name, body.email, hash_password(emp_no), body.role,
                             employee_no=emp_no, must_change_password=True)
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role,
            "employee_no": user.employee_no}


@router.patch("/{user_id}")
async def edit_user(user_id: int, body: UserUpdate, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    user = await update_user(db, user_id, body.model_dump(exclude_none=True))
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    return {"id": user.id, "name": user.name, "role": user.role, "is_active": user.is_active}


@router.post("/{user_id}/reset-password")
async def reset_password(user_id: int, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    """관리자가 비밀번호를 사번으로 초기화하고 강제 변경 플래그를 켠다."""
    user = await get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    if not user.employee_no:
        raise HTTPException(status_code=400, detail="사번이 없어 초기화할 수 없습니다.")
    user.password_hash = hash_password(user.employee_no)
    user.must_change_password = True
    await db.commit()
    return {"ok": True, "employee_no": user.employee_no}


@router.delete("/{user_id}")
async def remove_user(user_id: int, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    await deactivate_user(db, user_id)
    return {"ok": True}
