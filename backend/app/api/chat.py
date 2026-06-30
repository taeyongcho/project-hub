from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.socketio import sio
from app.models.chat import ChatMessage
from app.models.user import User
from app.models.project import Project

router = APIRouter(prefix="/chat", tags=["채팅"])


class MessageIn(BaseModel):
    channel: str
    content: str


def dm_channel(a: int, b: int) -> str:
    lo, hi = sorted([a, b])
    return f"dm:{lo}-{hi}"


def _can_access_channel(channel: str, user: User) -> bool:
    if channel == "team":
        return True
    if channel.startswith("project:"):
        return True  # 팀 전원 접근 (프로젝트 멤버십 강제하려면 여기서 확인)
    if channel.startswith("dm:"):
        try:
            ids = channel[3:].split("-")
            return str(user.id) in ids
        except Exception:
            return False
    return False


async def _serialize(m: ChatMessage, name_map: dict) -> dict:
    return {
        "id": m.id,
        "channel": m.channel,
        "sender_id": m.sender_id,
        "sender_name": name_map.get(m.sender_id, "?"),
        "content": m.content,
        "created_at": str(m.created_at),
    }


@router.get("/channels")
async def list_channels(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    proj_rows = await db.execute(select(Project).where(Project.status == "active"))
    projects = [{"id": p.id, "name": p.name, "color": p.color} for p in proj_rows.scalars().all()]
    user_rows = await db.execute(select(User).where(User.is_active == True, User.id != current_user.id))
    users = [{"id": u.id, "name": u.name, "role": u.role} for u in user_rows.scalars().all()]
    return {"projects": projects, "users": users}


@router.get("/messages")
async def get_messages(channel: str = Query(...), db: AsyncSession = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    if not _can_access_channel(channel, current_user):
        raise HTTPException(status_code=403, detail="접근 권한이 없습니다")
    rows = await db.execute(
        select(ChatMessage).where(ChatMessage.channel == channel)
        .order_by(ChatMessage.created_at.desc()).limit(100)
    )
    msgs = list(reversed(rows.scalars().all()))
    # 발신자 이름 매핑
    sender_ids = list({m.sender_id for m in msgs})
    name_map = {}
    if sender_ids:
        urows = await db.execute(select(User).where(User.id.in_(sender_ids)))
        name_map = {u.id: u.name for u in urows.scalars().all()}
    return [await _serialize(m, name_map) for m in msgs]


@router.post("/messages")
async def send_message(body: MessageIn, db: AsyncSession = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    if not _can_access_channel(body.channel, current_user):
        raise HTTPException(status_code=403, detail="접근 권한이 없습니다")
    if not body.content.strip():
        raise HTTPException(status_code=400, detail="빈 메시지")
    msg = ChatMessage(channel=body.channel, sender_id=current_user.id, content=body.content.strip())
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    payload = await _serialize(msg, {current_user.id: current_user.name})
    # 같은 채널 방의 모든 접속자에게 실시간 전송
    await sio.emit("chat_message", payload, room=f"chat_{body.channel}")
    return payload
