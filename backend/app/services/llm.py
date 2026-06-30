import os
import httpx

# LM Studio / Ollama 등 OpenAI 호환 로컬 LLM
# 도커 컨테이너에서 호스트 접근: host.docker.internal
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://host.docker.internal:1234/v1")
LLM_MODEL = os.getenv("LLM_MODEL", "qwen/qwen3-8b")

SYSTEM_PROMPT = (
    "당신은 'AI 사원'이라는 이름의 친절한 사내 업무 비서입니다. "
    "한국어로 간결하고 정중하게 답합니다. 업무, 일정, 문서 작성, 아이디어 정리 등을 돕습니다. "
    "모르는 것은 모른다고 솔직히 말하고, 추측은 추측이라고 표시하세요."
)


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
