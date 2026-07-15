import argparse
import json

from sqlmodel import Session

from backend.database.engine import create_db, engine
from backend.services.icloud_contacts import sync_credentials_path, sync_icloud_contacts


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync iCloud contacts into GPA V3 contacts.")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and count contacts without saving changes.")
    args = parser.parse_args()

    create_db()
    with Session(engine) as session:
        result = sync_icloud_contacts(session, dry_run=args.dry_run)
    result["credentials_file"] = str(sync_credentials_path())
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
