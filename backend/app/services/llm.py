import os
import json
import httpx

# LM Studio / Ollama 등 OpenAI 호환 로컬 LLM
# 도커 컨테이너에서 호스트 접근: host.docker.internal
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://host.docker.internal:1234/v1")
LLM_MODEL = os.getenv("LLM_MODEL", "qwen/qwen3-8b")

# Claude API (설정 시 우선 사용)
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-opus-4-8")
USE_CLAUDE = bool(ANTHROPIC_API_KEY)

SYSTEM_PROMPT = (
    "당신은 'AI 사원'이라는 이름의 친절한 사내 업무 비서입니다. "
    "한국어로 간결하고 정중하게 답합니다. 업무, 일정, 문서 작성, 아이디어 정리 등을 돕습니다. "
    "모르는 것은 모른다고 솔직히 말하고, 추측은 추측이라고 표시하세요.\n\n"
    "[액션 규칙] 사용자가 특정 태스크를 '완료 처리'해달라고 명확히 요청하면, "
    "답변 맨 끝에 다음 형식의 액션 태그를 정확히 한 줄로 출력하세요: "
    "[[DONE:정확한 태스크 제목]]\n"
    "제공된 '내 미완료 업무' 목록의 제목을 그대로 사용하세요. "
    "요청이 모호하면 어떤 태스크인지 되물으세요. 완료 요청이 아니면 태그를 쓰지 마세요."
)


def _strip_think(raw: str) -> str:
    """qwen 등의 <think>...</think> 블록을 제거한 가시 텍스트 반환"""
    if "</think>" in raw:
        return raw.split("</think>")[-1].lstrip()
    if raw.lstrip().startswith("<think>"):
        return ""  # 아직 thinking 진행 중
    return raw


async def _claude_stream(history: list[dict], system: str):
    """Claude API 스트리밍"""
    from anthropic import AsyncAnthropic
    # 첫 메시지는 user여야 함 → 앞쪽 assistant 제거
    msgs = [{"role": m["role"], "content": m["content"]} for m in history if m.get("content")]
    while msgs and msgs[0]["role"] != "user":
        msgs.pop(0)
    if not msgs:
        yield "무엇을 도와드릴까요?"
        return
    client = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
    try:
        async with client.messages.stream(
            model=ANTHROPIC_MODEL, max_tokens=1024, system=system, messages=msgs
        ) as stream:
            async for text in stream.text_stream:
                yield text
    except Exception as e:
        yield f"⚠️ Claude API 오류: {type(e).__name__} — API 키/모델을 확인해주세요."


async def generate_reply_stream(history: list[dict], context: str = ""):
    """토큰 단위로 가시 텍스트 증분(delta)을 yield하는 스트리밍 생성기"""
    system = SYSTEM_PROMPT + (("\n\n" + context) if context else "")

    # Claude API 우선
    if USE_CLAUDE:
        async for d in _claude_stream(history, system):
            yield d
        return
    payload = {
        "model": LLM_MODEL,
        "messages": [{"role": "system", "content": system}] + history,
        "temperature": 0.7,
        "max_tokens": 1024,
        "stream": True,
    }
    raw = ""
    emitted = 0
    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            async with client.stream("POST", f"{LLM_BASE_URL}/chat/completions", json=payload) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        delta = json.loads(data)["choices"][0]["delta"].get("content")
                    except Exception:
                        continue
                    if not delta:
                        continue
                    raw += delta
                    visible = _strip_think(raw)
                    if len(visible) > emitted:
                        chunk = visible[emitted:]
                        if emitted == 0:
                            chunk = chunk.lstrip()  # 첫 출력의 선행 공백 제거
                        emitted = len(visible)
                        if chunk:
                            yield chunk
    except httpx.ConnectError:
        yield ("⚠️ 로컬 LLM에 연결할 수 없습니다. LM Studio가 실행 중이고 "
               "서버(Local Server)가 켜져 있는지 확인해주세요. (포트 1234)")
    except Exception as e:
        yield f"⚠️ AI 응답 생성 중 오류: {type(e).__name__}"


async def generate_reply(history: list[dict]) -> str:
    """history: [{role: 'user'|'assistant', content: str}, ...] (시간순)"""
    messages = [{"role": "system", "content": SYSTEM_PROMPT}] + history
    payload = {
        "model": LLM_MODEL,
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 1024,
        "stream": False,
    }
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(f"{LLM_BASE_URL}/chat/completions", json=payload)
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"].strip()
            # qwen 등 일부 모델의 <think>...</think> 블록 제거
            if "</think>" in content:
                content = content.split("</think>")[-1].strip()
            return content or "(빈 응답)"
    except httpx.ConnectError:
        return ("⚠️ 로컬 LLM에 연결할 수 없습니다. LM Studio가 실행 중이고 "
                "서버(Local Server)가 켜져 있는지 확인해주세요. (기본 포트 1234)")
    except Exception as e:
        return f"⚠️ AI 응답 생성 중 오류가 발생했습니다: {type(e).__name__}"
