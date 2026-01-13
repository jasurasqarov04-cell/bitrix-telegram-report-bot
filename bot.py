import asyncio, logging
from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandStart
from aiogram.types import Message
from config import cfg
from models import Base
from sqlalchemy.ext.asyncio import create_async_engine
logging.basicConfig(level=logging.INFO)
bot = Bot(cfg.bot_token)
dp = Dispatcher()
engine = create_async_engine(cfg.db_url, echo=False)
@dp.message(CommandStart())
async def start_(m: Message):
await m.answer("Assalomu alaykum! Bot ishlamoqda. Tez kunda to‘liq versiya bo‘lar.")
async def main():
async with engine.begin() as conn:
await conn.run_sync(Base.metadata.create_all)
await dp.start_polling(bot, skip_updates=True)
if name == "main":
asyncio.run(main())
