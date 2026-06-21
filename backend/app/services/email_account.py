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


async def list_accounts(db: AsyncSession):
    result = await db.execute(select(EmailAccount).order_by(EmailAccount.id))
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
    account = await get_account(db, account_id)
    if not account:
        return {"error": "계정을 찾을 수 없습니다."}

    password = _dec(account.password_enc)
    imported = 0
    errors = []

    try:
        if account.pop3_ssl:
            conn = poplib.POP3_SSL(account.pop3_host, account.pop3_port)
        else:
            conn = poplib.POP3(account.pop3_host, account.pop3_port)

        conn.user(account.username)
        conn.pass_(password)

        num_messages = len(conn.list()[1])

        # 마지막 50개만
        start = max(1, num_messages - 49)

        for i in range(start, num_messages + 1):
            try:
                raw = b"\n".join(conn.retr(i)[1])
                msg = email_lib.message_from_bytes(raw)

                msg_id = msg.get("Message-ID", "").strip()
                path = f"pop3:{account_id}:{msg_id or i}"

                # 중복 확인
                existing = await db.execute(select(Email).where(Email.path == path))
                if existing.scalar_one_or_none():
                    continue

                subject = _decode_header(msg.get("Subject", ""))
                from_ = _decode_header(msg.get("From", ""))
                to_ = _decode_header(msg.get("To", ""))
                cc_ = _decode_header(msg.get("Cc", ""))
                date_str = msg.get("Date", "")

                import email.utils
                date_ts = None
                try:
                    parsed = email.utils.parsedate_to_datetime(date_str)
                    date_ts = parsed.timestamp()
                except Exception:
                    pass

                em = Email(
                    path=path,
                    subject=subject,
                    from_=from_,
                    to_=to_,
                    cc_=cc_,
                    date_str=date_str,
                    date_ts=date_ts,
                    status="unread",
                )
                db.add(em)
                imported += 1

            except Exception as e:
                errors.append(str(e))

        await db.commit()
        conn.quit()

    except Exception as e:
        return {"error": str(e), "imported": 0}

    return {"imported": imported, "errors": errors}


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
