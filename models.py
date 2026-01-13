from sqlalchemy import BigInteger, String, Integer, Float, Boolean, DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
class Base(DeclarativeBase):
pass
class User(Base):
tablename = "users"
id: Mapped[int] = mapped_column(primary_key=True)
tg_id: Mapped[int] = mapped_column(BigInteger, unique=True)
role: Mapped[str] = mapped_column(String(10))
name: Mapped[str] = mapped_column(String(64))
phone: Mapped[str] = mapped_column(String(16), nullable=True)
region: Mapped[str] = mapped_column(String(32))
lat: Mapped[float] = mapped_column(Float, nullable=True)
lon: Mapped[float] = mapped_column(Float, nullable=True)
rating: Mapped[int] = mapped_column(Integer, default=0)
created_at = mapped_column(DateTime, server_default=func.now())
class Lot(Base):
tablename = "lots"
id: Mapped[int] = mapped_column(primary_key=True)
seller_id: Mapped[int] = mapped_column(Integer)
category: Mapped[str] = mapped_column(String(10))
color: Mapped[str] = mapped_column(String(16))
weight_kg: Mapped[int] = mapped_column(Integer)
price_rub: Mapped[int] = mapped_column(Integer)
descr: Mapped[str] = mapped_column(String(900))
photo_file_id: Mapped[str] = mapped_column(String(256))
status: Mapped[str] = mapped_column(String(10), default="active")
boost: Mapped[bool] = mapped_column(Boolean, default=False)
created_at = mapped_column(DateTime, server_default=func.now())
