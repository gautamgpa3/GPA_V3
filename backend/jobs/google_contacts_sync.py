import argparse
import json

from sqlmodel import Session

from backend.database.engine import create_db, engine
from backend.services.google_contacts import audit_google_contacts, push_gpa_contacts_to_google, sync_credentials_path, sync_google_contacts, sync_google_contacts_two_way


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync Google contacts with GPA V3 contacts.")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and count contacts without saving changes.")
    parser.add_argument("--push", action="store_true", help="Create missing Google contacts from GPA contacts.")
    parser.add_argument("--two-way", action="store_true", help="Pull Google contacts into GPA, then create/update Google contacts from GPA.")
    parser.add_argument("--audit", action="store_true", help="Audit Google contacts against visible GPA contacts.")
    parser.add_argument("--query", default="", help="Name, phone, or email to find during --audit.")
    args = parser.parse_args()

    create_db()
    with Session(engine) as session:
        if args.audit:
            result = audit_google_contacts(session, query=args.query)
        elif args.two_way:
            result = sync_google_contacts_two_way(session, dry_run=args.dry_run)
        elif args.push:
            result = push_gpa_contacts_to_google(session, dry_run=args.dry_run)
        else:
            result = sync_google_contacts(session, dry_run=args.dry_run)
    result["credentials_file"] = str(sync_credentials_path())
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
