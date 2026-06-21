from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from datetime import date
from app.core.database import get_db
from app.core.security import get_current_user
from app.services.project import (get_all_projects, get_project, create_project,
                                   update_project, delete_project,
                                   create_milestone, update_milestone, delete_milestone,
                                   get_project_stats)

router = APIRouter(prefix="/projects", tags=["프로젝트"])


class ProjectCreate(BaseModel):
    name: str
    description: str = ""
    color: str = "#3b82f6"
    start_date: date | None = None
    end_date: date | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    color: str | None = None
    status: str | None = None
    start_date: date | None = None
    end_date: date | None = None


class MilestoneCreate(BaseModel):
    title: str
    due_date: date | None = None
    order: int = 0


@router.get("/")
async def list_projects(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    projects = await get_all_projects(db)
    return projects


@router.post("/")
async def add_project(body: ProjectCreate, db: AsyncSession = Depends(get_db),
                      current_user=Depends(get_current_user)):
    project = await create_project(db, body.model_dump(), current_user.id)
    return project


@router.get("/{project_id}")
async def get_one(project_id: int, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    project = await get_project(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")
    return project


@router.patch("/{project_id}")
async def edit_project(project_id: int, body: ProjectUpdate, db: AsyncSession = Depends(get_db),
                       _=Depends(get_current_user)):
    project = await update_project(db, project_id, body.model_dump(exclude_none=True))
    return project


@router.delete("/{project_id}")
async def remove_project(project_id: int, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    await delete_project(db, project_id)
    return {"ok": True}


@router.get("/{project_id}/stats")
async def project_stats(project_id: int, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    return await get_project_stats(db, project_id)


@router.post("/{project_id}/milestones")
async def add_milestone(project_id: int, body: MilestoneCreate, db: AsyncSession = Depends(get_db),
                        _=Depends(get_current_user)):
    return await create_milestone(db, project_id, body.model_dump())


@router.patch("/{project_id}/milestones/{ms_id}")
async def edit_milestone(project_id: int, ms_id: int, body: dict,
                         db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    return await update_milestone(db, ms_id, body)


@router.delete("/{project_id}/milestones/{ms_id}")
async def remove_milestone(project_id: int, ms_id: int, db: AsyncSession = Depends(get_db),
                           _=Depends(get_current_user)):
    await delete_milestone(db, ms_id)
    return {"ok": True}
