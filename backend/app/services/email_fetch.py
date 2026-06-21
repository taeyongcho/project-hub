import poplib
import email as email_lib
import email.header
import email.policy
import os
import hashlib
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.email import Email
from app.models.email_account import EmailAccount
from app.core.security import decrypt_password
from app.services.email import _decode_hdr, _extract_body


async def fetch_account(db: AsyncSession, account: EmailAccount, owner_id: int) -> dict:
    """POP3로 계정 메일 가져오기. {fetched, skipped, error} 반환"""
    try:
        password = decrypt_password(account.password_enc)
    except Exception as e:
        return {"account_id": account.id, "error": f"비밀번호 복호화 실패: {e}", "fetched": 0}

    try:
        if account.pop3_ssl:
            conn = poplib.POP3_SSL(account.pop3_host, account.pop3_port, timeout=15)
        else:
            conn = poplib.POP3(account.pop3_host, account.pop3_port, timeout=15)

        conn.user(account.username)
        conn.pass_(password)

        num_messages = len(conn.list()[1])
        # 최근 50통만 (이미 있는 건 skip)
        start = max(1, num_messages - 49)

        save_dir = "/app/emails"
        os.makedirs(save_dir, exist_ok=True)

        fetched = 0
        skipped = 0

        for i in range(start, num_messages + 1):
            try:
                raw_lines = conn.retr(i)[1]
                raw = b"\r\n".join(raw_lines)
                msg = email_lib.message_from_bytes(raw, policy=email_lib.policy.compat32)

                subject = _decode_hdr(msg.get("Subject", "")) or f"(제목없음_{i})"
                from_ = _decode_hdr(msg.get("From", ""))
                to_ = _decode_hdr(msg.get("To", ""))
                cc_ = _decode_hdr(msg.get("Cc", ""))
                date_str = msg.get("Date", "")
                message_id = msg.get("Message-ID", "")

                date_ts = None
                try:
                    from email.utils import parsedate_to_datetime
                    date_ts = parsedate_to_datetime(date_str).timestamp()
                except Exception:
                    pass

                # 고유 파일명: Message-ID 해시 또는 인덱스+계정
                uid = hashlib.md5((message_id or f"{account.id}_{i}").encode()).hexdigest()
                filename = f"pop3_{account.id}_{uid}.eml"
                path = os.path.join(save_dir, filename)

                # 이미 DB에 있으면 skip
                existing = await db.execute(select(Email).where(Email.path == path))
                if existing.scalar_one_or_none():
                    skipped += 1
                    continue

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
                    owner_id=owner_id,
                    account_id=account.id,
                )
                db.add(em)
                fetched += 1
            except Exception:
                continue

        await db.commit()
        conn.quit()
        return {"account_id": account.id, "account_name": account.name, "fetched": fetched, "skipped": skipped}

    except Exception as e:
        return {"account_id": account.id, "account_name": account.name, "error": str(e), "fetched": 0}


async def sync_all_accounts(db: AsyncSession, owner_id: int) -> list:
    result = await db.execute(
        select(EmailAccount).where(EmailAccount.owner_id == owner_id, EmailAccount.is_active == True)
    )
    accounts = result.scalars().all()
    if not accounts:
        return []

    results = []
    for account in accounts:
        r = await fetch_account(db, account, owner_id)
        results.append(r)
    return results
