from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.user import User


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_login(db: AsyncSession, login: str) -> User | None:
    """사번(employee_no) 우선, 없으면 이메일로 조회"""
    login = (login or "").strip()
    result = await db.execute(select(User).where(User.employee_no == login))
    user = result.scalar_one_or_none()
    if user:
        return user
    return await get_user_by_email(db, login)


async def get_user_by_id(db: AsyncSession, user_id: int) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_all_users(db: AsyncSession) -> list[User]:
    result = await db.execute(select(User).order_by(User.name))
    return result.scalars().all()


async def create_user(db: AsyncSession, name: str, email: str, password_hash: str, role: str,
                      employee_no: str = None, must_change_password: bool = False) -> User:
    user = User(name=name, email=email, password_hash=password_hash, role=role,
                employee_no=employee_no, must_change_password=must_change_password)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def update_user(db: AsyncSession, user_id: int, data: dict) -> User | None:
    user = await get_user_by_id(db, user_id)
    if not user:
        return None
    for k, v in data.items():
        setattr(user, k, v)
    await db.commit()
    await db.refresh(user)
    return user


async def deactivate_user(db: AsyncSession, user_id: int):
    user = await get_user_by_id(db, user_id)
    if user:
        user.is_active = False
        await db.commit()
