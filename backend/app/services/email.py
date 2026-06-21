import email as email_lib
import email.header
import email.policy
import os
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.models.email import Email
from app.models.memo import Memo


def _decode_hdr(val):
    if not val:
        return ""
    parts = email_lib.header.decode_header(str(val))
    out = []
    for part, charset in parts:
        if isinstance(part, bytes):
            for enc in [charset, "utf-8", "cp949", "euc-kr", "latin-1"]:
                try:
                    out.append(part.decode(enc or "utf-8", errors="replace"))
                    break
                except Exception:
                    pass
        else:
            out.append(str(part))
    return "".join(out).strip()


async def import_eml_file(db: AsyncSession, content: bytes, filename: str, owner_id: int = None):
    msg = email_lib.message_from_bytes(content, policy=email_lib.policy.compat32)
    subject = _decode_hdr(msg.get("Subject", "")) or filename
    from_ = _decode_hdr(msg.get("From", ""))
    to_ = _decode_hdr(msg.get("To", ""))
    cc_ = _decode_hdr(msg.get("Cc", ""))
    date_str = msg.get("Date", "")
    date_ts = None
    try:
        from email.utils import parsedate_to_datetime
        dt = parsedate_to_datetime(date_str)
        date_ts = dt.timestamp()
    except Exception:
        pass

    save_dir = "/app/emails"
    os.makedirs(save_dir, exist_ok=True)
    path = os.path.join(save_dir, filename)
    with open(path, "wb") as f:
        f.write(content)

    existing = await db.execute(select(Email).where(Email.path == path))
    if existing.scalar_one_or_none():
        return {"status": "skipped", "path": path}

    em = Email(path=path, subject=subject, from_=from_, to_=to_, cc_=cc_,
               date_str=date_str, date_ts=date_ts, owner_id=owner_id)
    db.add(em)
    await db.commit()
    await db.refresh(em)
    return _e(em)


async def get_emails(db: AsyncSession, owner_id: int, status=None, project_id=None,
                     assigned_to_id=None, q=None, skip=0, limit=100):
    query = select(Email).where(Email.owner_id == owner_id)
    if status:
        query = query.where(Email.status == status)
    if project_id:
        query = query.where(Email.project_id == project_id)
    if assigned_to_id:
        query = query.where(Email.assigned_to_id == assigned_to_id)
    if q:
        query = query.where(or_(Email.subject.ilike(f"%{q}%"), Email.from_.ilike(f"%{q}%")))
    query = query.order_by(Email.date_ts.desc().nullslast()).offset(skip).limit(limit)
    result = await db.execute(query)
    return [_e(e) for e in result.scalars().all()]


async def get_email(db: AsyncSession, email_id: int):
    result = await db.execute(select(Email).where(Email.id == email_id))
    e = result.scalar_one_or_none()
    return _e(e) if e else None


async def update_email_status(db: AsyncSession, email_id: int, data: dict):
    result = await db.execute(select(Email).where(Email.id == email_id))
    e = result.scalar_one_or_none()
    if e:
        for k, v in data.items():
            setattr(e, k, v)
        if data.get("status") == "replied":
            e.replied_at = datetime.now()
        await db.commit()
        await db.refresh(e)
    return _e(e)


async def get_overdue_reply(db: AsyncSession, days: int):
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    query = select(Email).where(
        Email.status == "pending",
        Email.date_ts < cutoff.timestamp()
    ).order_by(Email.date_ts.asc())
    result = await db.execute(query)
    emails = result.scalars().all()
    now_ts = datetime.now(timezone.utc).timestamp()
    return [{"days_waiting": int((now_ts - e.date_ts) / 86400), **_e(e)} for e in emails]


async def get_memos(db: AsyncSession, email_id: int):
    result = await db.execute(select(Memo).where(Memo.email_id == email_id).order_by(Memo.created_at))
    return [{"id": m.id, "content": m.content, "author_id": m.author_id,
             "created_at": str(m.created_at)} for m in result.scalars().all()]


async def add_memo(db: AsyncSession, email_id: int, author_id: int, content: str):
    m = Memo(email_id=email_id, author_id=author_id, content=content)
    db.add(m)
    await db.commit()
    await db.refresh(m)
    return {"id": m.id, "content": m.content, "author_id": m.author_id, "created_at": str(m.created_at)}


def _e(e: Email) -> dict:
    if not e:
        return None
    return {"id": e.id, "subject": e.subject, "from_": e.from_, "to_": e.to_,
            "date_str": e.date_str, "date_ts": e.date_ts, "status": e.status,
            "project_id": e.project_id, "assigned_to_id": e.assigned_to_id,
            "replied_at": str(e.replied_at) if e.replied_at else None}
