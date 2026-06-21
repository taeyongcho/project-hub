from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.database import engine, Base
from app.core.config import settings
from app.api import auth, users, projects, tasks, emails, reports, work_logs, email_accounts, dashboard, search, notifications


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
        # project_members 테이블은 create_all로 자동 생성됨
    await _create_admin()
    yield


async def _create_admin():
    if not settings.first_admin_email:
        return
    from app.core.database import AsyncSessionLocal
    from app.services.user import get_user_by_email, create_user
    from app.core.security import hash_password
    async with AsyncSessionLocal() as db:
        if not await get_user_by_email(db, settings.first_admin_email):
            await create_user(db, "관리자", settings.first_admin_email,
                              hash_password(settings.first_admin_password), "admin")


app = FastAPI(title="Project Hub API", lifespan=lifespan, redirect_slashes=False)

app.add_middleware(CORSMiddleware, allow_origins=["*"],
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


@app.get("/api/health")
async def health():
    return {"status": "ok"}
