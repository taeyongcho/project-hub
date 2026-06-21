from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.task import Task
from app.models.comment import Comment
from app.models.user import User


async def get_tasks(db: AsyncSession, project_id=None, assigned_to_id=None, status=None):
    q = select(Task)
    if project_id:
        q = q.where(Task.project_id == project_id)
    if assigned_to_id:
        q = q.where(Task.assigned_to_id == assigned_to_id)
    if status:
        q = q.where(Task.status == status)
    q = q.order_by(Task.wbs_order.asc(), Task.due_date.asc().nullslast(), Task.created_at.asc())
    result = await db.execute(q)
    return [_t(t) for t in result.scalars().all()]


async def get_task(db: AsyncSession, task_id: int):
    result = await db.execute(select(Task).where(Task.id == task_id))
    t = result.scalar_one_or_none()
    return _t(t) if t else None


async def create_task(db: AsyncSession, data: dict, created_by_id: int):
    task = Task(**data, created_by_id=created_by_id)
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return _t(task)


async def update_task(db: AsyncSession, task_id: int, data: dict):
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if task:
        for k, v in data.items():
            setattr(task, k, v)
        await db.commit()
        await db.refresh(task)
    return _t(task)


async def delete_task(db: AsyncSession, task_id: int):
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if task:
        await db.delete(task)
        await db.commit()


async def get_comments(db: AsyncSession, task_id: int):
    result = await db.execute(select(Comment).where(Comment.task_id == task_id).order_by(Comment.created_at))
    return [{"id": c.id, "author_id": c.author_id, "content": c.content,
             "created_at": str(c.created_at)} for c in result.scalars().all()]


async def add_comment(db: AsyncSession, task_id: int, author_id: int, content: str):
    c = Comment(task_id=task_id, author_id=author_id, content=content)
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return {"id": c.id, "author_id": c.author_id, "content": c.content, "created_at": str(c.created_at)}


def _t(t: Task) -> dict:
    if not t:
        return None
    return {"id": t.id, "title": t.title, "description": t.description,
            "status": t.status, "priority": t.priority,
            "start_date": str(t.start_date) if t.start_date else None,
            "due_date": str(t.due_date) if t.due_date else None,
            "done_at": str(t.done_at) if t.done_at else None,
            "project_id": t.project_id, "milestone_id": t.milestone_id,
            "assigned_to_id": t.assigned_to_id, "email_id": t.email_id,
            "parent_id": t.parent_id, "wbs_order": t.wbs_order or 0,
            "created_by_id": t.created_by_id, "created_at": str(t.created_at)}
