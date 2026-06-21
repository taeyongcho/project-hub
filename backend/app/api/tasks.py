from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from datetime import date, datetime
from app.core.database import get_db
from app.core.security import get_current_user
from app.services.task import (get_tasks, get_task, create_task, update_task,
                                delete_task, add_comment, get_comments)

router = APIRouter(prefix="/tasks", tags=["태스크"])


class TaskCreate(BaseModel):
    title: str
    description: str = ""
    priority: str = "normal"
    due_date: date | None = None
    project_id: int | None = None
    milestone_id: int | None = None
    assigned_to_id: int | None = None
    email_id: int | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    priority: str | None = None
    due_date: date | None = None
    milestone_id: int | None = None
    assigned_to_id: int | None = None


class CommentCreate(BaseModel):
    content: str


@router.get("/")
async def list_tasks(
    project_id: int | None = Query(None),
    assigned_to_id: int | None = Query(None),
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user)
):
    return await get_tasks(db, project_id=project_id, assigned_to_id=assigned_to_id, status=status)


@router.post("/")
async def add_task(body: TaskCreate, db: AsyncSession = Depends(get_db),
                   current_user=Depends(get_current_user)):
    return await create_task(db, body.model_dump(), current_user.id)


@router.get("/{task_id}")
async def get_one(task_id: int, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    task = await get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="태스크를 찾을 수 없습니다.")
    return task


@router.patch("/{task_id}")
async def edit_task(task_id: int, body: TaskUpdate, db: AsyncSession = Depends(get_db),
                    current_user=Depends(get_current_user)):
    data = body.model_dump(exclude_none=True)
    if data.get("status") == "done":
        data["done_at"] = datetime.now()
    return await update_task(db, task_id, data)


@router.delete("/{task_id}")
async def remove_task(task_id: int, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    await delete_task(db, task_id)
    return {"ok": True}


@router.get("/{task_id}/comments")
async def list_comments(task_id: int, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    return await get_comments(db, task_id)


@router.post("/{task_id}/comments")
async def post_comment(task_id: int, body: CommentCreate, db: AsyncSession = Depends(get_db),
                       current_user=Depends(get_current_user)):
    return await add_comment(db, task_id, current_user.id, body.content)
