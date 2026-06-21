from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    redis_url: str = "redis://redis:6379"
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 8  # 8시간
    first_admin_email: str = ""
    first_admin_password: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
