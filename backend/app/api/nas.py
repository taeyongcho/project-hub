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


NAS_TTL_DAYS = 7  # 파일 보관 기간 (지나면 자동 삭제)


async def _get_division(db: AsyncSession, user: User) -> str | None:
    """사용자 소속 본부명 — 조직 트리를 루트 바로 아래(본부)까지 올라감.
    본사/임원 직속은 그 이름 그대로."""
    from app.models.organization import Organization
    dept_code = getattr(user, "dept_code", None)
    if not dept_code:
        return getattr(user, "dept_name", None)
    orgs = {o.code: o for o in (await db.execute(select(Organization))).scalars().all()}
    node = orgs.get(dept_code)
    if not node:
        return getattr(user, "dept_name", None)
    while node.parent_code and orgs.get(node.parent_code) and orgs[node.parent_code].parent_code:
        node = orgs[node.parent_code]
    return node.name


def _can_access_top(user: User, division: str | None, rel: str) -> bool:
    if user.role == "admin":
        return True
    top = _top_dept(rel)
    if top is None:
        return True  # 루트 목록은 허용 (자기 본부만 필터되어 보임)
    return bool(division) and top == division


@router.get("/status")
async def status(_=Depends(get_current_user)):
    ok = os.path.isdir(NAS_ROOT) and bool(os.listdir(NAS_ROOT)) if os.path.isdir(NAS_ROOT) else False
    return {"connected": ok}


@router.get("/list")
async def list_dir(path: str = Query(""), db: AsyncSession = Depends(get_db),
                   current_user: User = Depends(get_current_user)):
    import time
    rel_in = (path or "").strip().lstrip("/")
    division = await _get_division(db, current_user)
    if not _can_access_top(current_user, division, rel_in):
        raise HTTPException(status_code=403, detail="본인 본부 폴더만 볼 수 있습니다")
    full = _safe_path(path)
    if not os.path.isdir(full):
        raise HTTPException(status_code=404, detail="폴더를 찾을 수 없습니다")
    now = time.time()
    dirs, files = [], []
    try:
        for name in sorted(os.listdir(full)):
            if name.startswith(".") or name in ("@eaDir", "#recycle"):
                continue
            fp = os.path.join(full, name)
            if os.path.isdir(fp):
                # 루트에서는 관리자 외엔 자기 본부 폴더만 노출
                if not rel_in and current_user.role != "admin" and name != division:
                    continue
                dirs.append({"name": name, "type": "dir"})
            else:
                try:
                    size = os.path.getsize(fp)
                    mtime = os.path.getmtime(fp)
                except OSError:
                    size, mtime = 0, 0
                age_days = (now - mtime) / 86400 if mtime else 0
                days_left = max(0, NAS_TTL_DAYS - int(age_days))
                files.append({"name": name, "type": "file", "size": size,
                              "mtime": mtime, "days_left": days_left})
    except PermissionError:
        raise HTTPException(status_code=403, detail="NAS 접근 권한 오류")
    return {"path": rel_in, "dirs": dirs, "files": files,
            "can_write": _can_access_top(current_user, division, rel_in) and bool(rel_in) or current_user.role == "admin",
            "my_dept": division, "ttl_days": NAS_TTL_DAYS}


@router.post("/attach")
async def attach_to_chat(body: dict, db: AsyncSession = Depends(get_db),
                         current_user: User = Depends(get_current_user)):
    """NAS 파일을 채팅 첨부용으로 복사하고 attachment 메타 반환"""
    rel = body.get("path") or ""
    division = await _get_division(db, current_user)
    if not _can_access_top(current_user, division, rel.strip().lstrip("/")):
        raise HTTPException(status_code=403, detail="본인 본부 파일만 첨부할 수 있습니다")
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
                 db: AsyncSession = Depends(get_db),
                 current_user: User = Depends(get_current_user)):
    """내 본부 폴더(또는 관리자)에 파일 업로드"""
    rel = (path or "").strip().lstrip("/")
    division = await _get_division(db, current_user)
    if not rel or not _can_access_top(current_user, division, rel):
        raise HTTPException(status_code=403, detail="본인 본부 폴더에만 업로드할 수 있습니다")
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
    """조직도의 본부 단위로 NAS 폴더 생성 + 안 쓰는 빈 폴더 정리 (관리자)"""
    from app.models.organization import Organization
    if not os.path.isdir(NAS_ROOT):
        raise HTTPException(status_code=500, detail="NAS가 연결되지 않았습니다")
    orgs = (await db.execute(select(Organization))).scalars().all()
    root_codes = {o.code for o in orgs if not o.parent_code}
    divisions = {o.name for o in orgs if not o.parent_code or o.parent_code in root_codes}
    created, removed = [], []
    for name in sorted(divisions):
        safe = name.replace("/", "_").replace("\\", "_")
        p = os.path.join(NAS_ROOT, safe)
        if not os.path.exists(p):
            try:
                os.makedirs(p)
                created.append(safe)
            except OSError:
                pass
    # 본부 목록에 없는 빈 폴더 정리 (내용 있는 폴더는 보존)
    for name in os.listdir(NAS_ROOT):
        if name.startswith(".") or name in ("@eaDir", "#recycle") or name in divisions:
            continue
        p = os.path.join(NAS_ROOT, name)
        if os.path.isdir(p):
            try:
                os.rmdir(p)  # 비어있을 때만 성공
                removed.append(name)
            except OSError:
                pass
    return {"created": created, "removed_empty": removed, "divisions": sorted(divisions)}
