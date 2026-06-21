"""
전체 DB 초기화 + ERP 재구축 시나리오 더미 데이터 삽입
실행: docker compose exec backend python seed_data.py
"""
import asyncio
from datetime import date
from app.core.database import AsyncSessionLocal, engine, Base
from app.models.user import User
from app.models.project import Project, Milestone
from app.models.task import Task
from app.models.project_member import ProjectMember
from app.core.security import hash_password
from sqlalchemy import text, select


async def clear_db(db):
    # 외래키 의존 순서대로 삭제
    for tbl in ['comments', 'memos', 'work_logs', 'tasks', 'milestones',
                'project_members', 'emails', 'email_accounts', 'projects']:
        await db.execute(text(f'DELETE FROM {tbl}'))
    # 사용자는 관리자만 남기고 삭제 후 재생성
    await db.execute(text("DELETE FROM users WHERE role != 'admin'"))
    await db.commit()
    print("✓ DB 초기화 완료")


async def create_users(db):
    users_data = [
        ("김PM",    "pm@erp.kr",      "admin"),
        ("이기획",  "plan@erp.kr",    "member"),
        ("박개발",  "dev1@erp.kr",    "member"),
        ("최개발",  "dev2@erp.kr",    "member"),
        ("정분석",  "analyst@erp.kr", "member"),
        ("강디자인","design@erp.kr",  "member"),
        ("윤QA",    "qa@erp.kr",      "member"),
    ]
    users = []
    for name, email, role in users_data:
        existing = await db.execute(select(User).where(User.email == email))
        u = existing.scalar_one_or_none()
        if not u:
            u = User(name=name, email=email,
                     password_hash=hash_password("1"), role=role, is_active=True)
            db.add(u)
            await db.flush()
        users.append(u)
    await db.commit()
    print(f"✓ 사용자 {len(users)}명 생성")
    return {u.name: u for u in users}


async def seed(db, users):
    pm      = users["김PM"]
    plan    = users["이기획"]
    dev1    = users["박개발"]
    dev2    = users["최개발"]
    analyst = users["정분석"]
    design  = users["강디자인"]
    qa      = users["윤QA"]

    # ── 프로젝트 1: ERP 차세대 재구축 ──────────────────────────────
    erp = Project(
        name="ERP 차세대 재구축",
        description="레거시 ERP 시스템을 클라우드 기반으로 전면 재구축. 구매·인사·회계 모듈 포함.",
        color="#3b82f6", status="active",
        start_date=date(2026, 6, 1), end_date=date(2026, 12, 31),
        owner_id=pm.id
    )
    db.add(erp)
    await db.flush()

    for u, role in [(pm, "owner"), (plan, "member"), (dev1, "member"),
                    (dev2, "member"), (analyst, "member"), (design, "member"), (qa, "member")]:
        db.add(ProjectMember(project_id=erp.id, user_id=u.id, role=role))

    # 마일스톤
    ms1 = Milestone(project_id=erp.id, title="요구사항 분석 완료", due_date=date(2026, 7, 31), order=1)
    ms2 = Milestone(project_id=erp.id, title="시스템 설계 완료",   due_date=date(2026, 8, 31), order=2)
    ms3 = Milestone(project_id=erp.id, title="1차 개발 완료",      due_date=date(2026, 10, 31), order=3)
    ms4 = Milestone(project_id=erp.id, title="UAT 및 안정화",      due_date=date(2026, 11, 30), order=4)
    ms5 = Milestone(project_id=erp.id, title="시스템 오픈",        due_date=date(2026, 12, 31), order=5)
    for ms in [ms1, ms2, ms3, ms4, ms5]:
        db.add(ms)
    await db.flush()

    # WBS + Tasks (parent_id로 계층 구성)
    def task(title, parent=None, order=0, status="todo", assignee=None,
             start=None, due=None, milestone=None, desc=""):
        t = Task(
            title=title, description=desc, status=status, priority="normal",
            project_id=erp.id,
            parent_id=parent.id if parent else None,
            wbs_order=order,
            assigned_to_id=assignee.id if assignee else None,
            start_date=start, due_date=due,
            milestone_id=milestone.id if milestone else None,
            created_by_id=pm.id,
        )
        db.add(t)
        return t

    await db.flush()

    # 1. 요구사항 분석
    w1 = task("1. 요구사항 분석", order=0)
    await db.flush()
    w1_1 = task("1.1 현행 시스템 분석",    w1, 0, "done",        analyst, date(2026,6,1),  date(2026,6,20), ms1, "현행 구매·인사·회계 모듈 프로세스 분석")
    w1_2 = task("1.2 AS-IS 문서화",        w1, 1, "done",        analyst, date(2026,6,10), date(2026,6,25), ms1, "현행 업무 흐름도 및 화면 목록 정리")
    w1_3 = task("1.3 TO-BE 설계",          w1, 2, "in_progress", plan,    date(2026,6,20), date(2026,7,15), ms1, "개선된 업무 프로세스 설계")
    w1_4 = task("1.4 요구사항 정의서 작성", w1, 3, "in_progress", plan,    date(2026,7,1),  date(2026,7,31), ms1, "기능/비기능 요구사항 정의서 작성")
    await db.flush()

    # 1.3 하위
    task("1.3.1 구매모듈 TO-BE", w1_3, 0, "done",        analyst, date(2026,6,20), date(2026,7,5),  ms1)
    task("1.3.2 인사모듈 TO-BE", w1_3, 1, "in_progress", plan,    date(2026,6,25), date(2026,7,10), ms1)
    task("1.3.3 회계모듈 TO-BE", w1_3, 2, "todo",        plan,    date(2026,7,5),  date(2026,7,15), ms1)
    await db.flush()

    # 2. 시스템 설계
    w2 = task("2. 시스템 설계", order=1)
    await db.flush()
    w2_1 = task("2.1 DB 설계",         w2, 0, "todo", dev1,   date(2026,8,1),  date(2026,8,20), ms2, "테이블 설계 및 ERD 작성")
    w2_2 = task("2.2 화면 설계",       w2, 1, "todo", design, date(2026,8,1),  date(2026,8,25), ms2, "Figma 기반 UI/UX 설계")
    w2_3 = task("2.3 인터페이스 설계", w2, 2, "todo", dev2,   date(2026,8,15), date(2026,8,31), ms2, "외부 시스템 연계 인터페이스 설계")
    await db.flush()

    task("2.1.1 구매 DB 설계", w2_1, 0, "todo", dev1, date(2026,8,1),  date(2026,8,10), ms2)
    task("2.1.2 인사 DB 설계", w2_1, 1, "todo", dev1, date(2026,8,5),  date(2026,8,12), ms2)
    task("2.1.3 회계 DB 설계", w2_1, 2, "todo", dev2, date(2026,8,10), date(2026,8,20), ms2)
    task("2.2.1 공통 UI 컴포넌트", w2_2, 0, "todo", design, date(2026,8,1),  date(2026,8,15), ms2)
    task("2.2.2 구매 화면 설계",   w2_2, 1, "todo", design, date(2026,8,10), date(2026,8,20), ms2)
    task("2.2.3 인사 화면 설계",   w2_2, 2, "todo", design, date(2026,8,15), date(2026,8,25), ms2)
    await db.flush()

    # 3. 개발
    w3 = task("3. 개발", order=2)
    await db.flush()
    w3_1 = task("3.1 구매모듈 개발", w3, 0, "todo", dev1, date(2026,9,1),  date(2026,10,15), ms3)
    w3_2 = task("3.2 인사모듈 개발", w3, 1, "todo", dev2, date(2026,9,1),  date(2026,10,15), ms3)
    w3_3 = task("3.3 회계모듈 개발", w3, 2, "todo", dev1, date(2026,9,15), date(2026,10,31), ms3)
    w3_4 = task("3.4 공통 프레임워크", w3, 3, "todo", dev2, date(2026,9,1), date(2026,9,30), ms3)
    await db.flush()

    task("3.1.1 발주 기능",   w3_1, 0, "todo", dev1, date(2026,9,1),  date(2026,9,20),  ms3)
    task("3.1.2 입고 기능",   w3_1, 1, "todo", dev1, date(2026,9,15), date(2026,10,5),  ms3)
    task("3.1.3 재고 관리",   w3_1, 2, "todo", dev1, date(2026,10,1), date(2026,10,15), ms3)
    task("3.2.1 인사 정보 관리", w3_2, 0, "todo", dev2, date(2026,9,1),  date(2026,9,25),  ms3)
    task("3.2.2 급여 처리",   w3_2, 1, "todo", dev2, date(2026,9,20), date(2026,10,10), ms3)
    task("3.2.3 근태 관리",   w3_2, 2, "todo", dev2, date(2026,10,5), date(2026,10,15), ms3)
    await db.flush()

    # 4. 테스트 및 오픈
    w4 = task("4. 테스트 및 오픈", order=3)
    await db.flush()
    task("4.1 단위 테스트",  w4, 0, "todo", qa,  date(2026,11,1),  date(2026,11,15), ms4)
    task("4.2 통합 테스트",  w4, 1, "todo", qa,  date(2026,11,10), date(2026,11,25), ms4)
    task("4.3 UAT",         w4, 2, "todo", plan, date(2026,11,20), date(2026,11,30), ms4)
    task("4.4 데이터 이관",  w4, 3, "todo", dev1, date(2026,12,1), date(2026,12,15), ms5)
    task("4.5 운영 이관",   w4, 4, "todo", pm,   date(2026,12,20), date(2026,12,31), ms5)
    await db.flush()

    # ── 프로젝트 2: 사내 포털 개선 (소규모) ────────────────────────
    portal = Project(
        name="사내 포털 개선",
        description="사내 인트라넷 포털 UI/UX 개선 및 기능 추가",
        color="#10b981", status="active",
        start_date=date(2026, 6, 15), end_date=date(2026, 8, 31),
        owner_id=design.id
    )
    db.add(portal)
    await db.flush()

    for u, role in [(design, "owner"), (dev1, "member"), (plan, "member")]:
        db.add(ProjectMember(project_id=portal.id, user_id=u.id, role=role))

    ms_p1 = Milestone(project_id=portal.id, title="디자인 확정", due_date=date(2026,7,15), order=1)
    ms_p2 = Milestone(project_id=portal.id, title="개발 완료",   due_date=date(2026,8,31), order=2)
    db.add(ms_p1); db.add(ms_p2)
    await db.flush()

    def ptask(title, parent=None, order=0, status="todo", assignee=None, start=None, due=None, ms=None):
        t = Task(title=title, status=status, priority="normal", project_id=portal.id,
                 parent_id=parent.id if parent else None, wbs_order=order,
                 assigned_to_id=assignee.id if assignee else None,
                 start_date=start, due_date=due,
                 milestone_id=ms.id if ms else None, created_by_id=design.id)
        db.add(t); return t

    p1 = ptask("1. 디자인",  order=0)
    p2 = ptask("2. 개발",    order=1)
    await db.flush()
    ptask("1.1 메인 화면 리디자인", p1, 0, "in_progress", design, date(2026,6,15), date(2026,7,5),  ms_p1)
    ptask("1.2 공지사항 개선",      p1, 1, "todo",        design, date(2026,7,1),  date(2026,7,15), ms_p1)
    ptask("2.1 프론트 개발",        p2, 0, "todo",        dev1,   date(2026,7,16), date(2026,8,15), ms_p2)
    ptask("2.2 백엔드 API",         p2, 1, "todo",        dev1,   date(2026,7,20), date(2026,8,20), ms_p2)
    ptask("2.3 테스트",             p2, 2, "todo",        qa,     date(2026,8,21), date(2026,8,31), ms_p2)
    await db.flush()

    # ── 프로젝트 3: 보안 취약점 점검 (완료) ───────────────────────
    sec = Project(
        name="보안 취약점 점검",
        description="연간 정기 보안 취약점 점검 및 조치",
        color="#ef4444", status="done",
        start_date=date(2026, 5, 1), end_date=date(2026, 5, 31),
        owner_id=dev2.id
    )
    db.add(sec)
    await db.flush()

    for u, role in [(dev2, "owner"), (qa, "member")]:
        db.add(ProjectMember(project_id=sec.id, user_id=u.id, role=role))

    ms_s1 = Milestone(project_id=sec.id, title="점검 완료", due_date=date(2026,5,31), order=1, is_done=True)
    db.add(ms_s1)
    await db.flush()

    for title, assignee, st in [
        ("웹 취약점 점검", dev2, "done"),
        ("SQL 인젝션 조치", dev2, "done"),
        ("XSS 취약점 조치", dev1, "done"),
        ("점검 보고서 작성", qa, "done"),
    ]:
        db.add(Task(title=title, status=st, priority="high", project_id=sec.id,
                    assigned_to_id=assignee.id, milestone_id=ms_s1.id,
                    created_by_id=dev2.id, wbs_order=0))

    await db.commit()
    print("✓ 프로젝트 3개, 마일스톤, WBS/태스크 생성 완료")


async def main():
    async with AsyncSessionLocal() as db:
        print("=== DB 초기화 및 더미 데이터 삽입 ===")
        await clear_db(db)
        users = await create_users(db)
        await seed(db, users)
        print("\n✅ 완료!")
        print("\n[계정 목록] 비밀번호: 1")
        for name, u in users.items():
            print(f"  {name:10s} {u.email}")

asyncio.run(main())
