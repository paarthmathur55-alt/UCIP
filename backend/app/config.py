import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./ucip.db")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "dev-secret-change-me")
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_EXPIRE_MINUTES: int = int(os.getenv("JWT_ACCESS_EXPIRE_MINUTES", "60"))
    EVENT_DEDUP_WINDOW_SECONDS: int = int(os.getenv("EVENT_DEDUP_WINDOW_SECONDS", "30"))
    DETECTOR_SHARED_KEY: str = os.getenv("DETECTOR_SHARED_KEY", "demo-detector-key")

    _cors_raw = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173"
    )
    CORS_ORIGINS: list = [origin.strip() for origin in _cors_raw.split(",") if origin.strip()]


settings = Settings()
