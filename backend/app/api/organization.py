from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import get_current_user, require_admin
from app.models.user import User
from app.services import organization as org_svc

router = APIRouter(prefix="/org", tags=["조직"])


@router.get("/tree")
async def tree(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    return await org_svc.get_tree(db)


@router.get("/employees")
async def employees(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    """부서·사번 포함 직원 목록"""
    rows = (await db.execute(
        select(User).where(User.is_active == True).order_by(User.dept_name, User.name)
    )).scalars().all()
    return [
        {"id": u.id, "name": u.name, "employee_no": u.employee_no,
         "dept_name": u.dept_name, "dept_code": u.dept_code, "role": u.role,
         "avatar_emoji": u.avatar_emoji, "avatar_color": u.avatar_color}
        for u in rows
    ]


@router.post("/import-orgs")
async def import_orgs(file: UploadFile = File(...), db: AsyncSession = Depends(get_db),
                      _=Depends(require_admin)):
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="빈 파일입니다.")
    return await org_svc.import_orgs(db, raw)


@router.post("/import-employees")
async def import_employees(file: UploadFile = File(...), db: AsyncSession = Depends(get_db),
                           _=Depends(require_admin)):
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="빈 파일입니다.")
    return await org_svc.import_employees(db, raw)
