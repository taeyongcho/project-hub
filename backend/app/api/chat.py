import os
import re
import uuid
import asyncio
import aiofiles
from fastapi import APIRouter, Depends, Query, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.socketio import sio
from datetime import datetime
from sqlalchemy import func
from app.models.chat import ChatMessage, ChatGroup, ChatRead, StickerAsset
from app.models.user import User
from app.models.project import Project

router = APIRouter(prefix="/chat", tags=["채팅"])

UPLOAD_DIR = "/app/uploads/chat"
os.makedirs(UPLOAD_DIR, exist_ok=True)
MAX_SIZE = 20 * 1024 * 1024  # 20MB


def _safe_ext(filename: str | None) -> str:
    """확장자만 안전하게 추출 (영숫자만 허용, 경로/특수문자 제거)"""
    ext = os.path.splitext(filename or "")[1].lower()
    ext = re.sub(r"[^a-z0-9.]", "", ext)[:10]
    return ext if ext.startswith(".") else (f".{ext}" if ext else "")


class MessageIn(BaseModel):
    channel: str
    content: str = ""
    attachment: dict | None = None
    reply_to: dict | None = None


class ReactIn(BaseModel):
    emoji: str


class GroupIn(BaseModel):
    name: str
    member_ids: list[int] = []


def dm_channel(a: int, b: int) -> str:
    lo, hi = sorted([a, b])
    return f"dm:{lo}-{hi}"


AI_USER_EMAIL = "ai@bot.local"


async def _get_ai_user(db: AsyncSession) -> User | None:
    return (await db.execute(select(User).where(User.email == AI_USER_EMAIL))).scalar_one_or_none()


async def _can_access_channel(channel: str, user: User, db: AsyncSession) -> bool:
    if channel == "team":
        return True
    if channel.startswith("project:"):
        return True  # 팀 전원 접근
    if channel.startswith("ai:"):
        # AI 사원 1:1 대화 (본인만)
        return channel[3:] == str(user.id)
    if channel.startswith("dm:"):
        try:
            return str(user.id) in channel[3:].split("-")
        except Exception:
            return False
    if channel.startswith("group:"):
        try:
            gid = int(channel.split(":")[1])
        except Exception:
            return False
        g = (await db.execute(select(ChatGroup).where(ChatGroup.id == gid))).scalar_one_or_none()
        return bool(g and user.id in (g.member_ids or []))
    return False


async def _serialize(m: ChatMessage, user_map: dict) -> dict:
    u = user_map.get(m.sender_id, {})
    return {
        "id": m.id,
        "channel": m.channel,
        "sender_id": m.sender_id,
        "sender_name": u.get("name", "?"),
        "sender_avatar": u.get("avatar_emoji", "🙂"),
        "sender_color": u.get("avatar_color", "#3b82f6"),
        "content": m.content,
        "attachment": m.attachment,
        "reply_to": m.reply_to,
        "reactions": m.reactions or {},
        "created_at": str(m.created_at),
    }


@router.post("/upload")
async def upload_file(file: UploadFile = File(...), _=Depends(get_current_user)):
    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="파일이 너무 큽니다 (최대 20MB)")
    ext = _safe_ext(file.filename)
    stored = f"{uuid.uuid4().hex}{ext}"
    async with aiofiles.open(os.path.join(UPLOAD_DIR, stored), "wb") as f:
        await f.write(data)
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
    user_rows = await db.execute(
        select(User).where(User.is_active == True, User.id != current_user.id)
        .order_by(User.dept_name.nullslast(), User.name)
    )
    users = [{"id": u.id, "name": u.name, "role": u.role,
              "dept_name": getattr(u, "dept_name", None),
              "avatar_emoji": u.avatar_emoji, "avatar_color": u.avatar_color} for u in user_rows.scalars().all()]
    ai = await _get_ai_user(db)
    ai_info = {"id": ai.id, "name": ai.name, "avatar_emoji": ai.avatar_emoji,
               "avatar_color": ai.avatar_color, "channel": f"ai:{current_user.id}"} if ai else None
    return {"projects": projects, "users": users, "ai_user": ai_info}


@router.get("/groups")
async def list_groups(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = await db.execute(select(ChatGroup).order_by(ChatGroup.created_at.desc()))
    groups = [g for g in rows.scalars().all() if current_user.id in (g.member_ids or [])]
    # 멤버 이름
    all_ids = {uid for g in groups for uid in (g.member_ids or [])}
    name_map = {}
    if all_ids:
        urows = await db.execute(select(User).where(User.id.in_(all_ids)))
        name_map = {u.id: u.name for u in urows.scalars().all()}
    return [{
        "id": g.id, "name": g.name, "member_ids": g.member_ids or [],
        "members": [{"id": uid, "name": name_map.get(uid, "?")} for uid in (g.member_ids or [])],
        "created_by_id": g.created_by_id,
    } for g in groups]


@router.post("/groups")
async def create_group(body: GroupIn, db: AsyncSession = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    members = sorted(set(body.member_ids) | {current_user.id})
    g = ChatGroup(name=body.name.strip() or "새 그룹", member_ids=members, created_by_id=current_user.id)
    db.add(g)
    await db.commit()
    await db.refresh(g)
    return {"id": g.id, "name": g.name, "member_ids": g.member_ids, "created_by_id": g.created_by_id}


@router.patch("/groups/{group_id}")
async def update_group(group_id: int, body: GroupIn, db: AsyncSession = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    g = (await db.execute(select(ChatGroup).where(ChatGroup.id == group_id))).scalar_one_or_none()
    if not g:
        raise HTTPException(status_code=404, detail="그룹을 찾을 수 없습니다")
    if current_user.id not in (g.member_ids or []):
        raise HTTPException(status_code=403, detail="그룹 멤버만 변경할 수 있습니다")
    g.name = body.name.strip() or g.name
    g.member_ids = sorted(set(body.member_ids) | {g.created_by_id})
    await db.commit()
    return {"id": g.id, "name": g.name, "member_ids": g.member_ids}


@router.delete("/groups/{group_id}")
async def delete_group(group_id: int, db: AsyncSession = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    g = (await db.execute(select(ChatGroup).where(ChatGroup.id == group_id))).scalar_one_or_none()
    if not g:
        raise HTTPException(status_code=404, detail="그룹을 찾을 수 없습니다")
    if g.created_by_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="생성자만 삭제할 수 있습니다")
    await db.delete(g)
    await db.commit()
    return {"message": "삭제됨"}


@router.get("/messages")
async def get_messages(channel: str = Query(...), db: AsyncSession = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    if not await _can_access_channel(channel, current_user, db):
        raise HTTPException(status_code=403, detail="접근 권한이 없습니다")
    rows = await db.execute(
        select(ChatMessage).where(ChatMessage.channel == channel)
        .order_by(ChatMessage.created_at.desc()).limit(100)
    )
    msgs = list(reversed(rows.scalars().all()))
    # 발신자 이름 매핑
    sender_ids = list({m.sender_id for m in msgs})
    user_map = {}
    if sender_ids:
        urows = await db.execute(select(User).where(User.id.in_(sender_ids)))
        user_map = {u.id: {"name": u.name, "avatar_emoji": u.avatar_emoji, "avatar_color": u.avatar_color} for u in urows.scalars().all()}
    return [await _serialize(m, user_map) for m in msgs]


@router.post("/messages")
async def send_message(body: MessageIn, db: AsyncSession = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    if not await _can_access_channel(body.channel, current_user, db):
        raise HTTPException(status_code=403, detail="접근 권한이 없습니다")
    if not body.content.strip() and not body.attachment:
        raise HTTPException(status_code=400, detail="빈 메시지")
    msg = ChatMessage(channel=body.channel, sender_id=current_user.id,
                      content=body.content.strip(), attachment=body.attachment,
                      reply_to=body.reply_to, reactions={})
    db.add(msg)

    # @멘션 알림 — 채널 접근 가능한 사용자 중 이름이 일치하면 알림 생성
    content = body.content or ""
    if "@" in content and not body.channel.startswith("ai:"):
        from app.services.notification import create_notification
        mentioned = set(re.findall(r"@([\w가-힣]+)", content))
        if mentioned:
            urows = await db.execute(select(User).where(User.is_active == True, User.name.in_(mentioned)))
            for u in urows.scalars().all():
                if await _can_access_channel(body.channel, u, db):
                    await create_notification(
                        db, u.id, "chat_mention", f"💬 {current_user.name}",
                        content[:80], actor_id=current_user.id)

    await db.commit()
    await db.refresh(msg)
    payload = await _serialize(msg, {current_user.id: {"name": current_user.name, "avatar_emoji": current_user.avatar_emoji, "avatar_color": current_user.avatar_color}})
    # 같은 채널 방의 모든 접속자에게 실시간 전송
    await sio.emit("chat_message", payload, room=f"chat_{body.channel}")

    # AI 사원 채널이면 백그라운드로 답변 생성
    if body.channel.startswith("ai:") and body.content.strip():
        asyncio.create_task(_ai_reply(body.channel))

    return payload


async def _build_user_context(db: AsyncSession, user_id: int) -> str:
    """AI가 참고할 사용자 업무 현황 요약 (태스크/오늘 업무일지)"""
    from datetime import date
    from app.models.task import Task
    from app.models.work_log import WorkLog
    lines = []
    # 진행/예정 태스크
    trows = await db.execute(
        select(Task).where(Task.assigned_to_id == user_id, Task.status != "done")
        .order_by(Task.due_date.asc()).limit(15)
    )
    tasks = trows.scalars().all()
    if tasks:
        st = {"todo": "할일", "in_progress": "진행중", "review": "검토"}
        lines.append("[내 미완료 업무]")
        for t in tasks:
            due = f" (마감 {t.due_date})" if t.due_date else ""
            lines.append(f"- {t.title} [{st.get(t.status, t.status)}]{due}")
    # 진행 중 프로젝트
    from app.models.project import Project
    prows = await db.execute(
        select(Project).where(Project.status == "active").order_by(Project.created_at.desc()).limit(8))
    projects = prows.scalars().all()
    if projects:
        lines.append("\n[진행 중 프로젝트]")
        for p in projects:
            lines.append(f"- {p.name}")
    # 내 미처리 이메일
    from app.models.email import Email
    erows = await db.execute(
        select(Email).where(Email.owner_id == user_id, Email.status.in_(["unread", "pending", "waiting"]))
        .order_by(Email.date_ts.desc()).limit(8))
    emails = erows.scalars().all()
    if emails:
        lines.append("\n[내 미처리 이메일]")
        for e in emails:
            lines.append(f"- {e.subject[:60]} (from {e.from_[:40]}, {e.status})")
    # 오늘 업무일지
    today = date.today()
    wl = (await db.execute(select(WorkLog).where(
        WorkLog.user_id == user_id, WorkLog.log_date == today))).scalar_one_or_none()
    if wl and (wl.content or wl.next_plan):
        lines.append(f"\n[오늘 업무일지] {today}")
        if wl.content: lines.append(f"완료: {wl.content[:300]}")
        if wl.next_plan: lines.append(f"계획: {wl.next_plan[:200]}")
    if not lines:
        return ""
    return ("아래는 현재 사용자의 업무 현황입니다. 관련 질문에 이 정보를 활용해 답하세요.\n"
            + "\n".join(lines))


async def _ai_reply(channel: str):
    """로컬 LLM으로 AI 사원 답변을 스트리밍 생성·브로드캐스트 (별도 세션)"""
    from app.core.database import AsyncSessionLocal
    from app.services.llm import generate_reply_stream
    room = f"chat_{channel}"
    async with AsyncSessionLocal() as db:
        ai = await _get_ai_user(db)
        if not ai:
            return
        # "입력 중" 표시
        await sio.emit("ai_typing", {"channel": channel, "typing": True}, room=room)

        # 최근 대화 20개 + 업무 컨텍스트
        rows = await db.execute(
            select(ChatMessage).where(ChatMessage.channel == channel)
            .order_by(ChatMessage.created_at.desc()).limit(20)
        )
        msgs = list(reversed(rows.scalars().all()))
        history = [
            {"role": "assistant" if m.sender_id == ai.id else "user", "content": m.content}
            for m in msgs if m.content
        ]
        try:
            uid = int(channel[3:])
        except Exception:
            uid = None
        context = await _build_user_context(db, uid) if uid else ""

        # 빈 AI 메시지 생성 → 스트리밍 시작 알림
        ai_msg = ChatMessage(channel=channel, sender_id=ai.id, content="", reactions={})
        db.add(ai_msg)
        await db.commit()
        await db.refresh(ai_msg)
        base = await _serialize(ai_msg, {ai.id: {"name": ai.name, "avatar_emoji": ai.avatar_emoji, "avatar_color": ai.avatar_color}})
        base["streaming"] = True
        await sio.emit("chat_message", base, room=room)

        # 토큰 스트리밍 (액션 태그 [[...]]는 화면에 노출하지 않음)
        full = ""
        sent = 0
        try:
            async for delta in generate_reply_stream(history, context):
                full += delta
                display = full.split("[[")[0]
                if len(display) > sent:
                    await sio.emit("ai_stream", {"channel": channel, "id": ai_msg.id, "delta": display[sent:]}, room=room)
                    sent = len(display)
        finally:
            await sio.emit("ai_typing", {"channel": channel, "typing": False}, room=room)

        # 액션 파싱·실행
        clean, notes = await _run_ai_actions(db, full, uid)
        final = (clean.strip() or "(빈 응답)")
        if notes:
            final += "\n\n" + "\n".join(notes)

        # 최종 내용 저장 + 완료 알림
        ai_msg.content = final
        await db.commit()
        await sio.emit("ai_stream_done", {"channel": channel, "id": ai_msg.id, "content": final}, room=room)


async def _run_ai_actions(db: AsyncSession, raw: str, uid: int | None):
    """AI 응답에서 [[DONE:제목]] 액션을 실행하고 (표시용 텍스트, 결과 메모) 반환"""
    import re
    from datetime import datetime
    from app.models.task import Task
    notes = []
    titles = re.findall(r"\[\[DONE:(.+?)\]\]", raw)
    clean = re.sub(r"\[\[DONE:.+?\]\]", "", raw)
    clean = re.sub(r"\[\[.*$", "", clean, flags=re.S)      # 미완성 태그 제거
    clean = re.sub(r"[\[\]]+\s*$", "", clean.rstrip())     # 끝에 남은 대괄호 정리
    if uid and titles:
        rows = await db.execute(
            select(Task).where(Task.assigned_to_id == uid, Task.status != "done"))
        tasks = rows.scalars().all()
        for title in titles:
            t = title.strip()
            match = next((x for x in tasks if x.title == t), None) \
                or next((x for x in tasks if t in x.title or x.title in t), None)
            if match:
                match.status = "done"
                match.done_at = datetime.utcnow()
                notes.append(f"✅ '{match.title}' 완료 처리했습니다.")
            else:
                notes.append(f"⚠️ '{t}' 태스크를 찾지 못했습니다.")
        await db.commit()
    return clean, notes


@router.post("/messages/{message_id}/react")
async def react(message_id: int, body: ReactIn, db: AsyncSession = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    m = (await db.execute(select(ChatMessage).where(ChatMessage.id == message_id))).scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="메시지를 찾을 수 없습니다")
    if not await _can_access_channel(m.channel, current_user, db):
        raise HTTPException(status_code=403, detail="접근 권한이 없습니다")
    reactions = dict(m.reactions or {})
    users = list(reactions.get(body.emoji, []))
    if current_user.id in users:
        users.remove(current_user.id)
    else:
        users.append(current_user.id)
    if users:
        reactions[body.emoji] = users
    else:
        reactions.pop(body.emoji, None)
    m.reactions = reactions
    await db.commit()
    # 실시간 반영
    await sio.emit("chat_update", {"id": m.id, "channel": m.channel, "reactions": reactions},
                   room=f"chat_{m.channel}")
    return {"id": m.id, "reactions": reactions}


@router.post("/read")
async def mark_read(body: dict, db: AsyncSession = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    channel = body.get("channel")
    if not channel:
        raise HTTPException(status_code=400, detail="channel 필요")
    now = datetime.utcnow()
    r = (await db.execute(select(ChatRead).where(
        ChatRead.user_id == current_user.id, ChatRead.channel == channel))).scalar_one_or_none()
    if r:
        r.last_read_at = now
    else:
        db.add(ChatRead(user_id=current_user.id, channel=channel, last_read_at=now))
    await db.commit()
    # 같은 방 사용자들에게 읽음 갱신 알림 (읽음 표시용)
    await sio.emit("chat_read", {"channel": channel, "user_id": current_user.id,
                                 "last_read_at": now.isoformat()}, room=f"chat_{channel}")
    return {"ok": True}


@router.get("/read-status")
async def read_status(channel: str, db: AsyncSession = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    """채널의 사용자별 마지막 읽은 시각 (읽음 멤버 표시용)"""
    if not await _can_access_channel(channel, current_user, db):
        raise HTTPException(status_code=403, detail="접근 권한이 없습니다")
    rows = (await db.execute(
        select(ChatRead, User.name).join(User, ChatRead.user_id == User.id)
        .where(ChatRead.channel == channel)
    )).all()
    return [{"user_id": r.user_id, "name": name,
             "last_read_at": r.last_read_at.isoformat() if r.last_read_at else None}
            for r, name in rows]


@router.get("/unread")
async def unread(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    reads = (await db.execute(select(ChatRead).where(ChatRead.user_id == current_user.id))).scalars().all()
    read_map = {r.channel: r.last_read_at for r in reads}
    # 메시지가 존재하는 채널들
    ch_rows = await db.execute(select(ChatMessage.channel).distinct())
    per = {}
    total = 0
    for (ch,) in ch_rows.all():
        if not await _can_access_channel(ch, current_user, db):
            continue
        last = read_map.get(ch)
        cond = [ChatMessage.channel == ch, ChatMessage.sender_id != current_user.id]
        if last is not None:
            cond.append(ChatMessage.created_at > last)
        cnt = await db.scalar(select(func.count(ChatMessage.id)).where(*cond))
        if cnt:
            per[ch] = cnt
            total += cnt
    return {"total": total, "channels": per}


@router.get("/conversations")
async def conversations(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """대화가 있는 방 목록 (LINE식): 마지막 메시지·시간·안읽음, 최신순"""
    reads = (await db.execute(select(ChatRead).where(ChatRead.user_id == current_user.id))).scalars().all()
    read_map = {r.channel: r.last_read_at for r in reads}

    # 채널별 마지막 메시지 시각
    ch_rows = (await db.execute(
        select(ChatMessage.channel, func.max(ChatMessage.created_at).label("last_at"))
        .group_by(ChatMessage.channel)
    )).all()

    # 라벨 해석용 맵
    users_map = {u.id: u for u in (await db.execute(select(User))).scalars().all()}
    projects_map = {p.id: p for p in (await db.execute(select(Project))).scalars().all()}
    groups_map = {g.id: g for g in (await db.execute(select(ChatGroup))).scalars().all()}
    ai = await _get_ai_user(db)

    out = []
    for ch, last_at in ch_rows:
        if not await _can_access_channel(ch, current_user, db):
            continue
        last_msg = (await db.execute(
            select(ChatMessage).where(ChatMessage.channel == ch)
            .order_by(ChatMessage.created_at.desc()).limit(1)
        )).scalars().first()
        if not last_msg:
            continue

        # 안읽음 수
        last_read = read_map.get(ch)
        cond = [ChatMessage.channel == ch, ChatMessage.sender_id != current_user.id]
        if last_read is not None:
            cond.append(ChatMessage.created_at > last_read)
        unread_cnt = await db.scalar(select(func.count(ChatMessage.id)).where(*cond)) or 0

        # 라벨/아이콘 해석
        label, kind, avatar = ch, "channel", None
        if ch == "team":
            label, kind = "전체 팀", "team"
        elif ch.startswith("project:"):
            p = projects_map.get(int(ch.split(":")[1]) if ch.split(":")[1].isdigit() else -1)
            if not p:
                continue
            label, kind, avatar = p.name, "project", {"color": p.color}
        elif ch.startswith("group:"):
            g = groups_map.get(int(ch.split(":")[1]) if ch.split(":")[1].isdigit() else -1)
            if not g:
                continue
            label, kind = g.name, "group"
        elif ch.startswith("ai:"):
            label, kind = "AI 사원", "ai"
            if ai:
                avatar = {"emoji": ai.avatar_emoji, "color": ai.avatar_color}
        elif ch.startswith("dm:"):
            try:
                a, b = ch[3:].split("-")
                other_id = int(b) if int(a) == current_user.id else int(a)
            except ValueError:
                continue
            other = users_map.get(other_id)
            if not other:
                continue
            label, kind = other.name, "dm"
            avatar = {"emoji": other.avatar_emoji, "color": other.avatar_color,
                      "dept": getattr(other, "dept_name", None), "user_id": other.id}

        sender = users_map.get(last_msg.sender_id)
        preview = "📎 파일" if last_msg.attachment else (last_msg.content or "")[:60]
        out.append({
            "channel": ch, "label": label, "kind": kind, "avatar": avatar,
            "preview": preview,
            "sender_name": sender.name if sender else "",
            "last_at": last_at.isoformat() if last_at else None,
            "unread": unread_cnt,
        })

    out.sort(key=lambda x: x["last_at"] or "", reverse=True)
    return out


@router.get("/stickers")
async def list_stickers(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    rows = await db.execute(select(StickerAsset).order_by(StickerAsset.created_at.desc()).limit(60))
    return [{"id": s.id, "url": s.url, "name": s.name} for s in rows.scalars().all()]


@router.post("/stickers")
async def add_sticker(file: UploadFile = File(...), db: AsyncSession = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    data = await file.read()
    if len(data) > 2 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="스티커는 최대 2MB")
    ext = _safe_ext(file.filename) or ".png"
    stored = f"{uuid.uuid4().hex}{ext}"
    async with aiofiles.open(os.path.join(UPLOAD_DIR, stored), "wb") as f:
        await f.write(data)
    s = StickerAsset(url=f"/api/chat/files/{stored}", name=(file.filename or "")[:255], created_by_id=current_user.id)
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return {"id": s.id, "url": s.url, "name": s.name}
