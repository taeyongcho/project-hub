import os
import uuid
from fastapi import APIRouter, Depends, Query, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
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

UPLOAD_DIR = "/app/uploads/chat"
os.makedirs(UPLOAD_DIR, exist_ok=True)
MAX_SIZE = 20 * 1024 * 1024  # 20MB


class MessageIn(BaseModel):
    channel: str
    content: str = ""
    attachment: dict | None = None


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
        "attachment": m.attachment,
        "created_at": str(m.created_at),
    }


@router.post("/upload")
async def upload_file(file: UploadFile = File(...), _=Depends(get_current_user)):
    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="파일이 너무 큽니다 (최대 20MB)")
    ext = os.path.splitext(file.filename or "")[1][:10]
    stored = f"{uuid.uuid4().hex}{ext}"
    with open(os.path.join(UPLOAD_DIR, stored), "wb") as f:
        f.write(data)
    return {
        "url": f"/api/chat/files/{stored}",
        "name": file.filename or stored,
        "type": file.content_type or "application/octet-stream",
        "size": len(data),
    }


@router.get("/files/{stored}")
async def get_file(stored: str):
    # uuid 파일명이라 추측 불가 → 이미지 태그가 헤더 없이 로드할 수 있도록 공개
    safe = os.path.basename(stored)
    path = os.path.join(UPLOAD_DIR, safe)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    return FileResponse(path)


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
    if not body.content.strip() and not body.attachment:
        raise HTTPException(status_code=400, detail="빈 메시지")
    msg = ChatMessage(channel=body.channel, sender_id=current_user.id,
                      content=body.content.strip(), attachment=body.attachment)
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    payload = await _serialize(msg, {current_user.id: current_user.name})
    # 같은 채널 방의 모든 접속자에게 실시간 전송
    await sio.emit("chat_message", payload, room=f"chat_{body.channel}")
    return payload
