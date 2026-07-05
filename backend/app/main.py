from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.wsgi import WSGIMiddleware
from socketio import ASGIApp
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.core.database import engine, Base, AsyncSessionLocal
from app.core.config import settings
from app.core.socketio import sio
from app.api import auth, users, projects, tasks, emails, reports, work_logs, email_accounts, dashboard, search, notifications, whiteboards, system_links, chat, cert_monitor


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # 기존 테이블에 새 컬럼 추가 (idempotent)
        from sqlalchemy import text
        await conn.execute(text(
            "ALTER TABLE emails ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_emails_owner_id ON emails(owner_id)"
        ))
        await conn.execute(text(
            "ALTER TABLE emails ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES email_accounts(id)"
        ))
        await conn.execute(text(
            "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES tasks(id)"
        ))
        await conn.execute(text(
            "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS wbs_order INTEGER DEFAULT 0"
        ))
        await conn.execute(text(
            "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date DATE"
        ))
        await conn.execute(text(
            "ALTER TABLE whiteboards ADD COLUMN IF NOT EXISTS thumbnail TEXT"
        ))
        await conn.execute(text(
            "ALTER TABLE whiteboards ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) DEFAULT 'shared'"
        ))
        await conn.execute(text(
            "ALTER TABLE whiteboards ADD COLUMN IF NOT EXISTS shared_with JSON DEFAULT '[]'"
        ))
        await conn.execute(text(
            "ALTER TABLE system_links ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id)"
        ))
        await conn.execute(text(
            "ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachment JSON"
        ))
        await conn.execute(text(
            "ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reply_to JSON"
        ))
        await conn.execute(text(
            "ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reactions JSON DEFAULT '{}'"
        ))
        await conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_emoji VARCHAR(16) DEFAULT '🙂'"
        ))
        await conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_color VARCHAR(20) DEFAULT '#3b82f6'"
        ))
        # project_members 테이블은 create_all로 자동 생성됨
    await _create_admin()
    await _create_ai_user()
    await _seed_certs()

    scheduler = AsyncIOScheduler()
    scheduler.add_job(_auto_generate_reports, 'cron', day_of_week=0, hour=9, id='weekly_report')
    scheduler.add_job(_auto_generate_reports, 'cron', day=1, hour=9, id='monthly_report')
    scheduler.add_job(_check_certs_job, 'cron', hour=8, minute=0, id='cert_check')
    scheduler.start()
    print("✓ 스케줄러 시작 (주간/월간 보고서, 매일 8시 인증서 점검)")

    yield

    scheduler.shutdown()


async def _create_admin():
    if not settings.first_admin_email:
        return
    from app.services.user import get_user_by_email, create_user
    from app.core.security import hash_password
    async with AsyncSessionLocal() as db:
        if not await get_user_by_email(db, settings.first_admin_email):
            await create_user(db, "관리자", settings.first_admin_email,
                              hash_password(settings.first_admin_password), "admin")


AI_USER_EMAIL = "ai@bot.local"


async def _create_ai_user():
    from app.services.user import get_user_by_email, create_user
    from app.core.security import hash_password
    from sqlalchemy import update
    from app.models.user import User
    import uuid
    async with AsyncSessionLocal() as db:
        existing = await get_user_by_email(db, AI_USER_EMAIL)
        if not existing:
            u = await create_user(db, "AI 사원", AI_USER_EMAIL,
                                   hash_password(uuid.uuid4().hex), "member")
            await db.execute(update(User).where(User.id == u.id).values(
                is_active=False, avatar_emoji="🤖", avatar_color="#6366f1"))
            await db.commit()
            print("✓ AI 사원 계정 생성됨")


async def _get_admin_id():
    from app.services.user import get_user_by_email
    if not settings.first_admin_email:
        return None
    async with AsyncSessionLocal() as db:
        user = await get_user_by_email(db, settings.first_admin_email)
        return user.id if user else None


DEFAULT_CERT_HOSTS = ["afg.kr", "www.afg.kr", "mail.afg.kr"]


async def _seed_certs():
    """최초 실행 시 afg.kr 그룹 도메인 시드 (관리자가 추가/삭제 가능)"""
    from sqlalchemy import select, func
    from app.models.cert_monitor import MonitoredCert
    from app.services.cert_monitor import _refresh
    admin_id = await _get_admin_id()
    async with AsyncSessionLocal() as db:
        count = await db.scalar(select(func.count(MonitoredCert.id)))
        if count and count > 0:
            return
        for host in DEFAULT_CERT_HOSTS:
            cert = MonitoredCert(host=host, port=443, created_by_id=admin_id)
            db.add(cert)
            await db.flush()
            await _refresh(db, cert)
        await db.commit()
        print(f"✓ 인증서 모니터링 기본 도메인 {len(DEFAULT_CERT_HOSTS)}개 등록")


async def _check_certs_job():
    from app.services.cert_monitor import refresh_all
    async with AsyncSessionLocal() as db:
        try:
            await refresh_all(db)
        except Exception as e:
            print(f"인증서 점검 오류: {e}")


async def _auto_generate_reports():
    from app.services.report import generate_weekly, generate_monthly
    admin_id = await _get_admin_id()
    if not admin_id:
        return
    async with AsyncSessionLocal() as db:
        try:
            await generate_weekly(db, admin_id)
            await generate_monthly(db, admin_id)
        except Exception as e:
            print(f"보고서 자동 생성 오류: {e}")


app = FastAPI(title="Project Hub API", lifespan=lifespan, redirect_slashes=False)

app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list,
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(emails.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(work_logs.router, prefix="/api")
app.include_router(email_accounts.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(whiteboards.router, prefix="/api")
app.include_router(system_links.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(cert_monitor.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# Socket.io ASGI 앱으로 래핑
app = ASGIApp(sio, app)
