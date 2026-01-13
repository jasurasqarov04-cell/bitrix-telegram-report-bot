import os
from dataclasses import dataclass
@dataclass
class Settings:
bot_token: str = os.getenv("BOT_TOKEN")
ovce_ch_id: int = int(os.getenv("OVCE_CHANNEL_ID") or 0)
admin_tg_id: int = int(os.getenv("ADMIN_TG_ID") or 0)
db_url: str = "sqlite+aiosqlite:///./skot.db"
cfg = Settings()
