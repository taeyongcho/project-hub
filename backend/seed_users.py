"""
더미 사용자 생성 스크립트
실행: docker exec -it <backend_container> python seed_users.py
"""
import asyncio
import sys
sys.path.insert(0, "/app")

DUMMY_USERS = [
    {"name": "김민준", "email": "minjun@company.com", "role": "admin"},
    {"name": "이서연", "email": "seoyeon@company.com", "role": "member"},
    {"name": "박지호", "email": "jiho@company.com", "role": "member"},
    {"name": "최유나", "email": "yuna@company.com", "role": "member"},
    {"name": "정하준", "email": "hajun@company.com", "role": "member"},
    {"name": "강민서", "email": "minseo@company.com", "role": "member"},
    {"name": "윤도현", "email": "dohyeon@company.com", "role": "viewer"},
    {"name": "임지수", "email": "jisu@company.com", "role": "viewer"},
]

async def seed():
    from app.core.database import AsyncSessionLocal
    from app.services.user import get_user_by_email, create_user
    from app.core.security import hash_password

    hashed_pw = hash_password("1")  # 비밀번호: 1

    async with AsyncSessionLocal() as db:
        created = 0
        skipped = 0
        for u in DUMMY_USERS:
            existing = await get_user_by_email(db, u["email"])
            if existing:
                print(f"  skip  {u['name']} ({u['email']}) — 이미 존재")
                skipped += 1
            else:
                await create_user(db, u["name"], u["email"], hashed_pw, u["role"])
                print(f"  ✓ 생성  {u['name']} ({u['email']}) [{u['role']}]")
                created += 1

    print(f"\n완료: {created}명 생성, {skipped}명 스킵 | 비밀번호: 1")

asyncio.run(seed())
