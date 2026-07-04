# Project Hub 회사 서버 배포 가이드 (192.168.11.100)

## 사전 준비 (서버에 설치)
- **Docker + Docker Compose** (Docker Desktop 또는 Docker Engine)
- 서버에서 8080 포트 사용 가능해야 함

---

## 1. 코드 서버로 복사
개발 PC에서 서버로 프로젝트 전체를 복사합니다 (git 또는 파일 복사).

```bash
# (예시) git 사용 시 — 서버에서
git clone <저장소> project-hub
cd project-hub
```
또는 개발 PC의 `C:\project-hub` 폴더를 통째로 서버에 복사.

---

## 2. .env 설정 (서버에서 수정)
서버의 `.env` 파일을 아래처럼 맞춥니다. **⚠️ 운영 배포이므로 SECRET_KEY와 관리자 비밀번호를 반드시 변경하세요.**

```env
DB_PASSWORD=<강력한_DB_비밀번호로_변경>
SECRET_KEY=wYll7_Sl-nkcbB7vEX4WSeisIMqd-e0QoELwxzdcaEMilBGSimi0qAoRKP7ZtE87
FIRST_ADMIN_EMAIL=jty1123@afg.kr
FIRST_ADMIN_PASSWORD=<강력한_관리자_비밀번호로_변경>
CORS_ORIGINS=http://localhost:8080,http://192.168.11.100:8080
```

> `CORS_ORIGINS`에 접속에 쓸 주소를 모두 넣습니다. 회사 IP `192.168.11.100`은 이미 추가되어 있습니다.
> 도메인(예: `http://hub.afg.kr`)으로 접속할 거면 그 주소도 콤마로 추가하세요.

---

## 3. 실행
서버의 project-hub 폴더에서:

```bash
docker compose up -d --build
```

첫 실행은 이미지 빌드로 몇 분 걸립니다. 완료 후:

```bash
docker compose ps        # 컨테이너 상태 확인 (nginx가 0.0.0.0:8080 노출)
docker compose logs -f backend   # 로그 확인
```

---

## 4. 접속
사내망 어디서나:

### http://192.168.11.100:8080

- 로그인: `.env`의 관리자 이메일 + 설정한 비밀번호
- (초기 더미 데이터가 필요하면) `docker compose exec backend python seed_data.py`

---

## 5. 방화벽 (서버가 Windows인 경우)
서버에서 **관리자 PowerShell**로 8080 인바운드 허용:

```powershell
New-NetFirewallRule -DisplayName "ProjectHub 8080" -Direction Inbound -LocalPort 8080 -Protocol TCP -Action Allow
```

Linux(ufw)면:
```bash
sudo ufw allow 8080/tcp
```

---

## 6. AI 사원(로컬 LLM) — 선택
AI 사원은 LM Studio/Ollama 같은 로컬 LLM이 필요합니다. 기본값은 **서버 호스트의 1234 포트**(`host.docker.internal:1234`)를 봅니다.

- **서버에 LM Studio를 설치**하고 모델을 로드 + Local Server 실행, 또는
- 다른 LLM 서버를 쓰려면 `.env`에 추가:
  ```env
  LLM_BASE_URL=http://<LLM서버IP>:1234/v1
  LLM_MODEL=<모델id>
  ```
- LLM이 없으면 AI 사원은 "연결할 수 없습니다" 안내만 표시하고, 나머지 기능은 정상 동작합니다.

---

## 업데이트 배포
코드를 갱신한 뒤:
```bash
git pull            # 또는 새 파일 복사
docker compose up -d --build
```

## 데이터 백업
DB는 `postgres_data` 볼륨에 저장됩니다.
```bash
docker compose exec db pg_dump -U projecthub projecthub > backup_$(date +%Y%m%d).sql
```

---

## 자주 겪는 문제
| 증상 | 원인 / 해결 |
|------|-------------|
| 다른 PC에서 접속 안 됨 | 서버 방화벽 8080 미개방 (5번) |
| 로그인 후 튕김 / API 실패 | `.env` CORS_ORIGINS에 접속 주소 누락 → 추가 후 `docker compose up -d backend` |
| 폰(LTE)에서 안 됨 | 사내 Wi-Fi에 연결해야 함 (사설 IP) |
| AI 사원 응답 없음 | LLM 서버 미실행 (6번) |
