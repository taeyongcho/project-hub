import csv
import io
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.organization import Organization
from app.models.user import User
from app.core.security import hash_password


def _decode(raw: bytes) -> str:
    """엑셀 한글 CSV 인코딩 대응 (utf-8-sig → cp949 폴백)"""
    for enc in ("utf-8-sig", "utf-8", "cp949", "euc-kr"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _rows(raw: bytes) -> list[dict]:
    text = _decode(raw)
    reader = csv.DictReader(io.StringIO(text))
    out = []
    for r in reader:
        out.append({(k or "").strip(): (v or "").strip() for k, v in r.items() if k})
    return out


async def import_orgs(db: AsyncSession, raw: bytes) -> dict:
    rows = _rows(raw)
    existing = {o.code: o for o in (await db.execute(select(Organization))).scalars().all()}
    created = updated = 0
    for i, r in enumerate(rows):
        code = r.get("code")
        name = r.get("name")
        if not code or not name:
            continue
        parent = r.get("parent_code") or None
        if code in existing:
            o = existing[code]
            o.name, o.parent_code, o.sort_order = name, parent, i
            updated += 1
        else:
            o = Organization(code=code, name=name, parent_code=parent, sort_order=i)
            db.add(o)
            existing[code] = o
            created += 1
    await db.commit()
    return {"created": created, "updated": updated, "total": created + updated}


async def import_employees(db: AsyncSession, raw: bytes) -> dict:
    rows = _rows(raw)
    # 부서명 → 조직코드 매핑
    orgs = (await db.execute(select(Organization))).scalars().all()
    name_to_code = {o.name: o.code for o in orgs}

    users = {u.employee_no: u for u in (await db.execute(select(User))).scalars().all() if u.employee_no}
    created = updated = skipped = 0
    for r in rows:
        emp = r.get("emp_id") or r.get("employee_no") or r.get("사번")
        name = r.get("name") or r.get("이름")
        dept = r.get("dept") or r.get("부서") or ""
        if not emp or not name:
            skipped += 1
            continue
        dept_code = name_to_code.get(dept)
        if emp in users:
            u = users[emp]
            u.name = name
            u.dept_name = dept or None
            u.dept_code = dept_code
            updated += 1
        else:
            u = User(
                name=name,
                email=f"{emp}@emp.local",           # 이메일 없는 직원용 placeholder
                password_hash=hash_password(emp),   # 초기 비밀번호 = 사번
                employee_no=emp,
                dept_name=dept or None,
                dept_code=dept_code,
                must_change_password=True,
                role="member",
            )
            db.add(u)
            users[emp] = u
            created += 1
    await db.commit()
    return {"created": created, "updated": updated, "skipped": skipped}


async def get_tree(db: AsyncSession) -> list[dict]:
    orgs = (await db.execute(
        select(Organization).order_by(Organization.sort_order)
    )).scalars().all()
    # 부서별 인원수
    users = (await db.execute(select(User).where(User.is_active == True))).scalars().all()
    count_by_code = {}
    for u in users:
        if u.dept_code:
            count_by_code[u.dept_code] = count_by_code.get(u.dept_code, 0) + 1

    nodes = {o.code: {"code": o.code, "name": o.name, "parent_code": o.parent_code,
                      "member_count": count_by_code.get(o.code, 0), "children": []}
             for o in orgs}
    roots = []
    for o in orgs:
        node = nodes[o.code]
        if o.parent_code and o.parent_code in nodes:
            nodes[o.parent_code]["children"].append(node)
        else:
            roots.append(node)
    return roots
