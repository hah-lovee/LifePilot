"""manual crypto trades: user-entered cost basis for positions the
automatic exchange trade-history sync can't price (renamed/delisted
trading pairs, external transfers, etc.)

Revision ID: 0012
Revises: 0011
Create Date: 2026-07-19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "manual_crypto_trades",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("portfolio_name", sa.String(60), nullable=False),
        sa.Column("currency", sa.String(20), nullable=False),
        sa.Column("trade_date", sa.Date(), nullable=False),
        sa.Column("side", sa.String(4), nullable=False),
        sa.Column("quantity", sa.Numeric(24, 8), nullable=False),
        sa.Column("price_usdt", sa.Numeric(24, 8), nullable=False),
        sa.Column("fee_usdt", sa.Numeric(24, 8), nullable=True),
        sa.Column("note", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index(
        "idx_manual_crypto_trades_lookup",
        "manual_crypto_trades",
        ["user_id", "portfolio_name", "currency"],
    )


def downgrade() -> None:
    op.drop_index("idx_manual_crypto_trades_lookup", table_name="manual_crypto_trades")
    op.drop_table("manual_crypto_trades")
