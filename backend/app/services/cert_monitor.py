import ssl
import socket
import asyncio
from datetime import datetime, timezone
from cryptography import x509
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.cert_monitor import MonitoredCert

# 만료 임박 기준 (일)
WARN_DAYS = 30


def _check_cert_sync(host: str, port: int = 443):
    """host:port 에 TLS 접속해 인증서 만료일/발급자를 읽는다. (동기, 블로킹)"""
    ctx = ssl.create_default_context()
    # 만료·자체서명 인증서도 정보를 읽기 위해 검증 비활성화
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    with socket.create_connection((host, port), timeout=8) as sock:
        with ctx.wrap_socket(sock, server_hostname=host) as ssock:
            der = ssock.getpeercert(binary_form=True)
    cert = x509.load_der_x509_certificate(der)
    expires = cert.not_valid_after_utc.astimezone(timezone.utc).replace(tzinfo=None)
    try:
        issuer = cert.issuer.rfc4514_string()
    except Exception:
        issuer = ""
    return expires, issuer


async def check_cert(host: str, port: int = 443):
    return await asyncio.to_thread(_check_cert_sync, host, port)


def _days_left(expires_at):
    if not expires_at:
        return None
    return (expires_at - datetime.utcnow()).days


def _serialize(c: MonitoredCert) -> dict:
    dl = _days_left(c.expires_at)
    if c.last_error:
        status = "error"
    elif dl is None:
        status = "unknown"
    elif dl < 0:
        status = "expired"
    elif dl <= WARN_DAYS:
        status = "warning"
    else:
        status = "ok"
    return {
        "id": c.id,
        "host": c.host,
        "label": c.label or c.host,
        "port": c.port,
        "expires_at": str(c.expires_at) if c.expires_at else None,
        "issuer": c.issuer,
        "days_left": dl,
        "status": status,
        "last_error": c.last_error,
        "last_checked": str(c.last_checked) if c.last_checked else None,
    }


async def list_certs(db: AsyncSession) -> list[dict]:
    rows = await db.execute(select(MonitoredCert).order_by(MonitoredCert.host))
    return [_serialize(c) for c in rows.scalars().all()]


async def _refresh(db: AsyncSession, cert: MonitoredCert):
    try:
        expires, issuer = await check_cert(cert.host, cert.port or 443)
        cert.expires_at = expires
        cert.issuer = issuer
        cert.last_error = None
    except Exception as e:
        cert.last_error = f"{type(e).__name__}: {e}"[:500]
    cert.last_checked = datetime.utcnow()


async def add_cert(db: AsyncSession, host: str, label: str, port: int, user_id: int) -> dict:
    host = host.strip().replace("https://", "").replace("http://", "").split("/")[0]
    if ":" in host:
        host, _, p = host.partition(":")
        port = int(p) if p.isdigit() else port
    cert = MonitoredCert(host=host, label=(label or "").strip() or None,
                         port=port or 443, created_by_id=user_id)
    db.add(cert)
    await db.flush()
    await _refresh(db, cert)
    await db.commit()
    await db.refresh(cert)
    return _serialize(cert)


async def refresh_cert(db: AsyncSession, cert_id: int) -> dict | None:
    cert = await db.get(MonitoredCert, cert_id)
    if not cert:
        return None
    await _refresh(db, cert)
    await db.commit()
    await db.refresh(cert)
    return _serialize(cert)


async def refresh_all(db: AsyncSession):
    rows = await db.execute(select(MonitoredCert))
    certs = rows.scalars().all()
    for c in certs:
        await _refresh(db, c)
    await db.commit()
    return [_serialize(c) for c in certs]


async def delete_cert(db: AsyncSession, cert_id: int):
    cert = await db.get(MonitoredCert, cert_id)
    if cert:
        await db.delete(cert)
        await db.commit()


async def expiring_soon(db: AsyncSession) -> list[dict]:
    """만료됐거나 30일 이내 임박한 인증서 (알림용)"""
    certs = await list_certs(db)
    return [c for c in certs if c["status"] in ("expired", "warning")]
