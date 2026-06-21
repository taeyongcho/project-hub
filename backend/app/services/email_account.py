import base64
import poplib
import smtplib
import email as email_lib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.header import decode_header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.email_account import EmailAccount
from app.models.email import Email


def _enc(pw: str) -> str:
    return base64.b64encode(pw.encode()).decode()


def _dec(enc: str) -> str:
    return base64.b64decode(enc.encode()).decode()


def _decode_header(val: str) -> str:
    if not val:
        return ""
    parts = decode_header(val)
    result = ""
    for b, charset in parts:
        if isinstance(b, bytes):
            result += b.decode(charset or "utf-8", errors="replace")
        else:
            result += b
    return result


async def list_accounts(db: AsyncSession, owner_id: int):
    result = await db.execute(
        select(EmailAccount).where(EmailAccount.owner_id == owner_id).order_by(EmailAccount.id)
    )
    accounts = result.scalars().all()
    return [_a(a) for a in accounts]


async def get_account(db: AsyncSession, account_id: int):
    result = await db.execute(select(EmailAccount).where(EmailAccount.id == account_id))
    return result.scalar_one_or_none()


async def create_account(db: AsyncSession, data: dict) -> EmailAccount:
    data = dict(data)
    data["password_enc"] = _enc(data.pop("password"))
    account = EmailAccount(**data)
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return account


async def update_account(db: AsyncSession, account_id: int, data: dict):
    account = await get_account(db, account_id)
    if not account:
        return None
    data = dict(data)
    if "password" in data:
        data["password_enc"] = _enc(data.pop("password"))
    for k, v in data.items():
        setattr(account, k, v)
    await db.commit()
    await db.refresh(account)
    return account


async def delete_account(db: AsyncSession, account_id: int):
    account = await get_account(db, account_id)
    if account:
        await db.delete(account)
        await db.commit()


async def fetch_emails_pop3(db: AsyncSession, account_id: int) -> dict:
    import hashlib, os
    account = await get_account(db, account_id)
    if not account:
        return {"error": "계정을 찾을 수 없습니다."}

    password = _dec(account.password_enc)
    imported = 0
    skipped = 0
    errors = []

    save_dir = "/app/emails"
    os.makedirs(save_dir, exist_ok=True)

    try:
        if account.pop3_ssl:
            conn = poplib.POP3_SSL(account.pop3_host, account.pop3_port, timeout=20)
        else:
            conn = poplib.POP3(account.pop3_host, account.pop3_port, timeout=20)

        conn.user(account.username)
        conn.pass_(password)

        num_messages = len(conn.list()[1])
        start = max(1, num_messages - 49)

        for i in range(start, num_messages + 1):
            try:
                raw_lines = conn.retr(i)[1]
                raw = b"\r\n".join(raw_lines)
                msg = email_lib.message_from_bytes(raw)

                msg_id = msg.get("Message-ID", "").strip()
                uid = hashlib.md5((msg_id or f"{account_id}_{i}").encode()).hexdigest()
                filename = f"pop3_{account_id}_{uid}.eml"
                path = os.path.join(save_dir, filename)

                existing = await db.execute(select(Email).where(Email.path == path))
                if existing.scalar_one_or_none():
                    skipped += 1
                    continue

                subject = _decode_header(msg.get("Subject", "")) or "(제목없음)"
                from_ = _decode_header(msg.get("From", ""))
                to_ = _decode_header(msg.get("To", ""))
                cc_ = _decode_header(msg.get("Cc", ""))
                date_str = msg.get("Date", "")

                import email.utils
                date_ts = None
                try:
                    date_ts = email.utils.parsedate_to_datetime(date_str).timestamp()
                except Exception:
                    pass

                with open(path, "wb") as f:
                    f.write(raw)

                em = Email(
                    path=path,
                    subject=subject,
                    from_=from_,
                    to_=to_,
                    cc_=cc_,
                    date_str=date_str,
                    date_ts=date_ts,
                    status="unread",
                    owner_id=account.owner_id,
                    account_id=account.id,
                )
                db.add(em)
                imported += 1

            except Exception as e:
                errors.append(str(e))

        await db.commit()
        conn.quit()

    except Exception as e:
        return {"error": str(e), "imported": 0}

    return {"imported": imported, "skipped": skipped, "errors": errors[:5]}


async def fetch_all_accounts(db: AsyncSession, owner_id: int) -> dict:
    """해당 유저의 모든 활성 계정 동기화"""
    result = await db.execute(
        select(EmailAccount).where(
            EmailAccount.owner_id == owner_id,
            EmailAccount.is_active == True
        )
    )
    accounts = result.scalars().all()
    if not accounts:
        return {"total_imported": 0, "accounts": [], "message": "등록된 계정이 없습니다."}

    results = []
    total = 0
    for acc in accounts:
        r = await fetch_emails_pop3(db, acc.id)
        r["account_name"] = acc.name
        r["account_email"] = acc.email
        results.append(r)
        total += r.get("imported", 0)

    return {"total_imported": total, "accounts": results}


async def send_email_smtp(account_id: int, db: AsyncSession,
                          to: str, subject: str, body: str,
                          cc: str = "", reply_to_msg_id: str = "") -> dict:
    account = await get_account(db, account_id)
    if not account:
        return {"error": "계정을 찾을 수 없습니다."}

    password = _dec(account.password_enc)

    msg = MIMEMultipart("alternative")
    msg["From"] = f"{account.name} <{account.email}>"
    msg["To"] = to
    msg["Subject"] = subject
    if cc:
        msg["Cc"] = cc
    if reply_to_msg_id:
        msg["In-Reply-To"] = reply_to_msg_id
        msg["References"] = reply_to_msg_id
    msg.attach(MIMEText(body, "plain", "utf-8"))

    recipients = [r.strip() for r in to.split(",")]
    if cc:
        recipients += [r.strip() for r in cc.split(",")]

    try:
        if account.smtp_tls:
            with smtplib.SMTP(account.smtp_host, account.smtp_port, timeout=15) as smtp:
                smtp.ehlo()
                smtp.starttls()
                smtp.login(account.username, password)
                smtp.sendmail(account.email, recipients, msg.as_bytes())
        else:
            with smtplib.SMTP_SSL(account.smtp_host, account.smtp_port, timeout=15) as smtp:
                smtp.login(account.username, password)
                smtp.sendmail(account.email, recipients, msg.as_bytes())
    except Exception as e:
        return {"error": str(e)}

    return {"ok": True}


def _a(a: EmailAccount) -> dict:
    return {
        "id": a.id, "name": a.name, "email": a.email,
        "username": a.username,
        "pop3_host": a.pop3_host, "pop3_port": a.pop3_port, "pop3_ssl": a.pop3_ssl,
        "smtp_host": a.smtp_host, "smtp_port": a.smtp_port, "smtp_tls": a.smtp_tls,
        "is_active": a.is_active, "owner_id": a.owner_id,
    }
