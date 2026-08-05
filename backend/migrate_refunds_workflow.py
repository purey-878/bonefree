"""Add cancellation, counter-payment confirmation, and refund audit storage.

Run from the backend directory:
    python migrate_refunds_workflow.py
"""

from database import engine
from schema_migrations import apply_schema_migrations


def main() -> None:
    apply_schema_migrations(engine)
    print("refund workflow migration complete")


if __name__ == "__main__":
    main()
