from __future__ import annotations

import argparse
import time

from database import SessionLocal
from modules.restaurant.services.data_exports import (
    cleanup_expired_data_exports,
    process_next_pending_export,
)
from modules.auth.services.organization_lifecycle import send_due_access_notifications


def main() -> None:
    parser = argparse.ArgumentParser(description="Process durable data export jobs.")
    parser.add_argument("--all", action="store_true", help="Process every pending job.")
    parser.add_argument("--watch", action="store_true", help="Keep polling for jobs and reminders.")
    parser.add_argument("--poll-seconds", type=int, default=15)
    args = parser.parse_args()

    processed = 0
    while True:
        with SessionLocal() as db:
            cleanup_expired_data_exports(db)
            while True:
                export = process_next_pending_export(db)
                if export is None:
                    break
                processed += 1
                print(f"ready {export.public_id} {export.sha256}", flush=True)
                if not args.all and not args.watch:
                    break
            send_due_access_notifications(db)
        if not args.watch:
            break
        time.sleep(max(1, args.poll_seconds))
    print(f"processed={processed}")


if __name__ == "__main__":
    main()
