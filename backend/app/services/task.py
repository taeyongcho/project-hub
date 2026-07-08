from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.task import Task
from app.models.comment import Comment
from app.models.user import User
from app.services.notification import create_notification


async def _user_name(db: AsyncSession, user_id: int) -> str:
    if not user_id:
        return "누군가"
    name = await db.scalar(select(User.name).where(User.id == user_id))
    return name or "누군가"


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
    await db.flush()
    # 배정 알림
    if task.assigned_to_id and task.assigned_to_id != created_by_id:
        actor = await _user_name(db, created_by_id)
        await create_notification(db, task.assigned_to_id, "task_assigned",
                                  task.title, f"{actor}님이 태스크를 배정했습니다",
                                  task_id=task.id, actor_id=created_by_id)
    await db.commit()
    await db.refresh(task)
    return _t(task)


async def update_task(db: AsyncSession, task_id: int, data: dict, actor_id: int = None):
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if task:
        prev_assignee = task.assigned_to_id
        for k, v in data.items():
            setattr(task, k, v)
        await db.flush()
        # 새로 배정된 경우 알림
        new_assignee = task.assigned_to_id
        if new_assignee and new_assignee != prev_assignee and new_assignee != actor_id:
            actor = await _user_name(db, actor_id)
            await create_notification(db, new_assignee, "task_assigned",
                                      task.title, f"{actor}님이 태스크를 배정했습니다",
                                      task_id=task.id, actor_id=actor_id)
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
    await db.flush()
    # 태스크 작성자·담당자에게 댓글 알림 (본인 제외, 중복 제거)
    task = await db.scalar(select(Task).where(Task.id == task_id))
    if task:
        actor = await _user_name(db, author_id)
        recipients = {task.created_by_id, task.assigned_to_id} - {None, author_id}
        for uid in recipients:
            await create_notification(db, uid, "task_comment",
                                      task.title, f"{actor}님이 댓글을 남겼습니다",
                                      task_id=task.id, actor_id=author_id)
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
            "attachments": t.attachments or [],
            "created_by_id": t.created_by_id, "created_at": str(t.created_at)}
