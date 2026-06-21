from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from app.models.project import Project, Milestone
from app.models.task import Task
from app.models.project_member import ProjectMember
from app.models.user import User


async def get_all_projects(db: AsyncSession):
    result = await db.execute(select(Project).order_by(Project.created_at.desc()))
    projects = result.scalars().all()
    out = []
    for p in projects:
        stats = await get_project_stats(db, p.id)
        out.append({**_p(p), **stats})
    return out


async def get_project(db: AsyncSession, project_id: int):
    result = await db.execute(select(Project).where(Project.id == project_id))
    p = result.scalar_one_or_none()
    if not p:
        return None
    ms_result = await db.execute(select(Milestone).where(Milestone.project_id == project_id).order_by(Milestone.order))
    milestones = ms_result.scalars().all()
    return {**_p(p), "milestones": [_ms(m) for m in milestones]}


async def create_project(db: AsyncSession, data: dict, owner_id: int, member_ids: list[int] = None):
    project = Project(**data, owner_id=owner_id)
    db.add(project)
    await db.flush()
    # 소유자를 owner 역할로 자동 추가
    db.add(ProjectMember(project_id=project.id, user_id=owner_id, role="owner"))
    # 추가 멤버
    for uid in (member_ids or []):
        if uid != owner_id:
            db.add(ProjectMember(project_id=project.id, user_id=uid, role="member"))
    await db.commit()
    await db.refresh(project)
    return _p(project)


async def update_project(db: AsyncSession, project_id: int, data: dict):
    result = await db.execute(select(Project).where(Project.id == project_id))
    p = result.scalar_one_or_none()
    if p:
        for k, v in data.items():
            setattr(p, k, v)
        await db.commit()
        await db.refresh(p)
    return _p(p)


async def delete_project(db: AsyncSession, project_id: int):
    result = await db.execute(select(Project).where(Project.id == project_id))
    p = result.scalar_one_or_none()
    if p:
        await db.delete(p)
        await db.commit()


async def get_project_stats(db: AsyncSession, project_id: int) -> dict:
    total = await db.scalar(select(func.count(Task.id)).where(Task.project_id == project_id))
    done = await db.scalar(select(func.count(Task.id)).where(Task.project_id == project_id, Task.status == "done"))
    overdue = await db.scalar(select(func.count(Task.id)).where(
        Task.project_id == project_id, Task.status != "done",
        Task.due_date < func.current_date()))
    return {"total_tasks": total or 0, "done_tasks": done or 0, "overdue_tasks": overdue or 0,
            "progress": round((done / total * 100) if total else 0)}


async def create_milestone(db: AsyncSession, project_id: int, data: dict):
    ms = Milestone(**data, project_id=project_id)
    db.add(ms)
    await db.commit()
    await db.refresh(ms)
    return _ms(ms)


async def update_milestone(db: AsyncSession, ms_id: int, data: dict):
    result = await db.execute(select(Milestone).where(Milestone.id == ms_id))
    ms = result.scalar_one_or_none()
    if ms:
        for k, v in data.items():
            setattr(ms, k, v)
        await db.commit()
        await db.refresh(ms)
    return _ms(ms)


async def delete_milestone(db: AsyncSession, ms_id: int):
    result = await db.execute(select(Milestone).where(Milestone.id == ms_id))
    ms = result.scalar_one_or_none()
    if ms:
        await db.delete(ms)
        await db.commit()


def _p(p: Project) -> dict:
    return {"id": p.id, "name": p.name, "description": p.description,
            "color": p.color, "status": p.status, "owner_id": p.owner_id,
            "start_date": str(p.start_date) if p.start_date else None,
            "end_date": str(p.end_date) if p.end_date else None}


def _ms(m: Milestone) -> dict:
    return {"id": m.id, "project_id": m.project_id, "title": m.title,
            "due_date": str(m.due_date) if m.due_date else None,
            "is_done": m.is_done, "order": m.order}


async def get_project_members(db: AsyncSession, project_id: int):
    rows = await db.execute(
        select(ProjectMember, User)
        .join(User, ProjectMember.user_id == User.id)
        .where(ProjectMember.project_id == project_id)
        .order_by(ProjectMember.joined_at)
    )
    return [
        {"user_id": u.id, "name": u.name, "email": u.email,
         "role": pm.role, "is_active": u.is_active}
        for pm, u in rows.all()
    ]


async def add_project_member(db: AsyncSession, project_id: int, user_id: int, role: str = "member"):
    existing = await db.scalar(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id
        )
    )
    if existing:
        return None
    pm = ProjectMember(project_id=project_id, user_id=user_id, role=role)
    db.add(pm)
    await db.commit()
    return pm


async def remove_project_member(db: AsyncSession, project_id: int, user_id: int):
    await db.execute(
        delete(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
            ProjectMember.role != "owner"
        )
    )
    await db.commit()
