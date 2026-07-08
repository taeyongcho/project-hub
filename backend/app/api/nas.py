import os
import uuid
import shutil
import aiofiles
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import get_current_user, require_admin
from app.models.user import User

router = APIRouter(prefix="/nas", tags=["부서 자료실"])

NAS_ROOT = "/app/nas"
CHAT_UPLOAD_DIR = "/app/uploads/chat"
MAX_ATTACH = 50 * 1024 * 1024  # 채팅 첨부 최대 50MB


def _safe_path(rel: str) -> str:
    """NAS 루트 밖으로 나가는 경로 차단"""
    rel = (rel or "").strip().lstrip("/").replace("\\", "/")
    full = os.path.realpath(os.path.join(NAS_ROOT, rel))
    root = os.path.realpath(NAS_ROOT)
    if not (full == root or full.startswith(root + os.sep)):
        raise HTTPException(status_code=400, detail="잘못된 경로입니다")
    return full


def _top_dept(rel: str) -> str | None:
    """경로의 최상위 부서 폴더명"""
    parts = [p for p in (rel or "").strip().lstrip("/").replace("\\", "/").split("/") if p]
    return parts[0] if parts else None


def _can_write(user: User, rel: str) -> bool:
    if user.role == "admin":
        return True
    dept = getattr(user, "dept_name", None)
    return bool(dept) and _top_dept(rel) == dept


@router.get("/status")
async def status(_=Depends(get_current_user)):
    ok = os.path.isdir(NAS_ROOT) and bool(os.listdir(NAS_ROOT)) if os.path.isdir(NAS_ROOT) else False
    return {"connected": ok}


@router.get("/list")
async def list_dir(path: str = Query(""), current_user: User = Depends(get_current_user)):
    full = _safe_path(path)
    if not os.path.isdir(full):
        raise HTTPException(status_code=404, detail="폴더를 찾을 수 없습니다")
    dirs, files = [], []
    try:
        for name in sorted(os.listdir(full)):
            if name.startswith(".") or name in ("@eaDir", "#recycle"):
                continue
            fp = os.path.join(full, name)
            if os.path.isdir(fp):
                dirs.append({"name": name, "type": "dir"})
            else:
                try:
                    size = os.path.getsize(fp)
                    mtime = os.path.getmtime(fp)
                except OSError:
                    size, mtime = 0, 0
                files.append({"name": name, "type": "file", "size": size, "mtime": mtime})
    except PermissionError:
        raise HTTPException(status_code=403, detail="NAS 접근 권한 오류")
    rel = (path or "").strip().lstrip("/")
    return {"path": rel, "dirs": dirs, "files": files,
            "can_write": _can_write(current_user, rel) if rel else current_user.role == "admin",
            "my_dept": getattr(current_user, "dept_name", None)}


@router.post("/attach")
async def attach_to_chat(body: dict, current_user: User = Depends(get_current_user)):
    """NAS 파일을 채팅 첨부용으로 복사하고 attachment 메타 반환"""
    rel = body.get("path") or ""
    full = _safe_path(rel)
    if not os.path.isfile(full):
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    size = os.path.getsize(full)
    if size > MAX_ATTACH:
        raise HTTPException(status_code=413, detail="채팅 첨부는 최대 50MB입니다")
    name = os.path.basename(full)
    ext = os.path.splitext(name)[1].lower()[:10]
    stored = f"{uuid.uuid4().hex}{ext}"
    os.makedirs(CHAT_UPLOAD_DIR, exist_ok=True)
    shutil.copyfile(full, os.path.join(CHAT_UPLOAD_DIR, stored))
    import mimetypes
    ctype = mimetypes.guess_type(name)[0] or "application/octet-stream"
    return {"url": f"/api/chat/files/{stored}", "name": name, "type": ctype, "size": size}


@router.post("/upload")
async def upload(path: str = Query(""), file: UploadFile = File(...),
                 current_user: User = Depends(get_current_user)):
    """내 부서 폴더(또는 관리자)에 파일 업로드"""
    rel = (path or "").strip().lstrip("/")
    if not _can_write(current_user, rel):
        raise HTTPException(status_code=403, detail="본인 부서 폴더에만 업로드할 수 있습니다")
    full = _safe_path(rel)
    if not os.path.isdir(full):
        raise HTTPException(status_code=404, detail="폴더를 찾을 수 없습니다")
    data = await file.read()
    if len(data) > 200 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="최대 200MB")
    name = os.path.basename(file.filename or "unnamed")
    async with aiofiles.open(os.path.join(full, name), "wb") as f:
        await f.write(data)
    return {"ok": True, "name": name}


@router.post("/init-dept-folders")
async def init_dept_folders(db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    """조직도의 팀·파트 부서명으로 NAS 폴더 자동 생성 (관리자)"""
    if not os.path.isdir(NAS_ROOT):
        raise HTTPException(status_code=500, detail="NAS가 연결되지 않았습니다")
    rows = (await db.execute(
        select(User.dept_name).where(User.dept_name != None).distinct()
    )).all()
    created = []
    for (dept,) in rows:
        safe = dept.replace("/", "_").replace("\\", "_")
        p = os.path.join(NAS_ROOT, safe)
        if not os.path.exists(p):
            try:
                os.makedirs(p)
                created.append(safe)
            except OSError:
                pass
    return {"created": created, "count": len(created)}
