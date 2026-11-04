"""Export offline translation proposals and preview/apply a reviewed JSON bundle.

python -m scripts.translate_catalog export --output /tmp/catalog.proposed.json
python -m scripts.translate_catalog import --file /tmp/catalog.proposed.json --dry-run
python -m scripts.translate_catalog import --file /tmp/catalog.proposed.json --apply
"""
from __future__ import annotations

import argparse
from pathlib import Path
import sys

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from core.config import settings
from database import SessionLocal
from services.catalog_translation_bundle import Bundle, import_bundle, propose


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    export = commands.add_parser("export", help="Generate offline proposals from the configured catalog")
    export.add_argument("--output", type=Path, required=True)
    importer = commands.add_parser("import", help="Preview by default; only --apply writes")
    importer.add_argument("--file", type=Path, required=True)
    modes = importer.add_mutually_exclusive_group()
    modes.add_argument("--dry-run", action="store_true")
    modes.add_argument("--apply", action="store_true")
    importer.add_argument("--overwrite", action="store_true", help="Replace existing nonblank fields included in this file")
    importer.add_argument("--apply-product-names", action="store_true", help="Apply reviewed English names to Portuguese source names and both locales")
    importer.add_argument("--allow-production", action="store_true", help="Explicitly permit --apply with ENVIRONMENT=production")
    importer.add_argument("--report", type=Path, help="Save field-level preview or import report")
    args = parser.parse_args()
    try:
        with SessionLocal() as db:
            if args.command == "export":
                bundle = propose(db)
                # Exclusive creation prevents accidentally losing a reviewed bundle.
                with args.output.open("x", encoding="utf-8") as output:
                    output.write(bundle.model_dump_json(indent=2) + "\n")
                print(f"Wrote {len(bundle.entries)} catalog entries to {args.output}. Review all translations and notes before importing.")
                return
            if args.apply and settings.environment == "production" and not args.allow_production:
                raise ValueError("Production writes require --apply --allow-production after backup and review.")
            bundle = Bundle.model_validate_json(args.file.read_text(encoding="utf-8"))
            report = import_bundle(db, bundle, apply=args.apply, overwrite=args.overwrite, apply_product_names=args.apply_product_names)
            import json
            output = json.dumps({"mode": "apply" if args.apply else "dry-run", **report}, ensure_ascii=False, indent=2)
            # Persist the report before commit: a failed report write must not save changes.
            if args.report:
                if args.report.resolve() == args.file.resolve():
                    raise ValueError("Report must not overwrite the reviewed input bundle.")
                with args.report.open("x", encoding="utf-8") as destination:
                    destination.write(output + "\n")
            if args.apply:
                db.commit()
            else:
                db.rollback()
            print(output)
    except Exception as exc:
        # Session context rolls back all uncommitted changes, including failed imports.
        raise SystemExit(f"Catalog translation command failed: {exc}") from exc


if __name__ == "__main__":
    main()
