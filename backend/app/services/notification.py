from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.models.notification import Notification


async def create_notification(db: AsyncSession, user_id: int, ntype: str,
                              title: str, message: str,
                              task_id: int = None, actor_id: int = None):
    """이벤트 알림 생성. 수신자==행위자면 생성 안 함."""
    if not user_id or user_id == actor_id:
        return None
    n = Notification(user_id=user_id, type=ntype, title=(title or "")[:300],
                     message=(message or "")[:300], task_id=task_id, actor_id=actor_id)
    db.add(n)
    return n


async def list_stored(db: AsyncSession, user_id: int, limit: int = 30):
    rows = await db.execute(
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.is_read.asc(), Notification.created_at.desc())
        .limit(limit)
    )
    return rows.scalars().all()


async def unread_count(db: AsyncSession, user_id: int) -> int:
    from sqlalchemy import func
    return await db.scalar(
        select(func.count(Notification.id)).where(
            Notification.user_id == user_id, Notification.is_read == False
        )
    ) or 0


async def mark_read(db: AsyncSession, user_id: int, notif_id: int):
    await db.execute(
        update(Notification).where(
            Notification.id == notif_id, Notification.user_id == user_id
        ).values(is_read=True)
    )
    await db.commit()


async def mark_all_read(db: AsyncSession, user_id: int):
    await db.execute(
        update(Notification).where(
            Notification.user_id == user_id, Notification.is_read == False
        ).values(is_read=True)
    )
    await db.commit()
