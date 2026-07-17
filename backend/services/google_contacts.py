import json
from dataclasses import dataclass
from datetime import datetime
from os import getenv
from pathlib import Path
from re import sub
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from sqlmodel import Session, select

from backend.models.activity import ActivityLog
from backend.models.contact import Contact


DEFAULT_SYNC_FILE = "/opt/gpa-v3/secrets/google_contacts.env"
TOKEN_URL = "https://oauth2.googleapis.com/token"
PEOPLE_CONNECTIONS_URL = "https://people.googleapis.com/v1/people/me/connections"
PEOPLE_CREATE_CONTACT_URL = "https://people.googleapis.com/v1/people:createContact"
PERSON_FIELDS = "names,emailAddresses,phoneNumbers,organizations,addresses,biographies,metadata"


@dataclass
class GoogleCredentials:
    client_id: str
    client_secret: str
    refresh_token: str


@dataclass
class ParsedGoogleContact:
    name: str
    phone: str = ""
    whatsapp: str = ""
    email: str = ""
    company: str = ""
    address: str = ""
    notes: str = ""
    google_resource_name: str = ""
    google_etag: str = ""


def sync_credentials_path() -> Path:
    return Path(getenv("GPA_GOOGLE_CONTACTS_FILE", DEFAULT_SYNC_FILE))


def load_key_value_file(path: Path) -> dict[str, str]:
    if not path.exists():
        raise FileNotFoundError(f"Google contacts credentials file not found: {path}")
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        clean = line.strip()
        if not clean or clean.startswith("#") or "=" not in clean:
            continue
        key, value = clean.split("=", 1)
        values[key.strip().upper()] = value.strip()
    return values


def load_google_credentials(path: Path | None = None) -> GoogleCredentials:
    values = load_key_value_file(path or sync_credentials_path())
    client_id = values.get("CLIENT_ID", "")
    client_secret = values.get("CLIENT_SECRET", "")
    refresh_token = values.get("REFRESH_TOKEN", "")
    if not client_id or not client_secret or not refresh_token:
        raise ValueError("CLIENT_ID, CLIENT_SECRET and REFRESH_TOKEN are required for Google contacts sync")
    return GoogleCredentials(client_id=client_id, client_secret=client_secret, refresh_token=refresh_token)


def google_token(credentials: GoogleCredentials) -> str:
    body = urlencode(
        {
            "client_id": credentials.client_id,
            "client_secret": credentials.client_secret,
            "refresh_token": credentials.refresh_token,
            "grant_type": "refresh_token",
        }
    ).encode("utf-8")
    request = Request(TOKEN_URL, data=body, headers={"Content-Type": "application/x-www-form-urlencoded"}, method="POST")
    try:
        with urlopen(request, timeout=45) as response:
            data = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"Google OAuth token request failed: HTTP {error.code} {detail[:250]}") from error
    except URLError as error:
        raise RuntimeError(f"Google OAuth token connection failed: {error.reason}") from error
    token = data.get("access_token", "")
    if not token:
        raise RuntimeError("Google OAuth token response did not include an access token")
    return token


def google_api_request(method: str, url: str, access_token: str, body: dict | None = None) -> dict:
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json; charset=utf-8",
        "Accept": "application/json",
    }
    request = Request(
        url,
        data=json.dumps(body).encode("utf-8") if body is not None else None,
        headers=headers,
        method=method,
    )
    try:
        with urlopen(request, timeout=60) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"Google People API request failed: HTTP {error.code} {detail[:250]}") from error
    except URLError as error:
        raise RuntimeError(f"Google People API connection failed: {error.reason}") from error


def first_value(items: list[dict] | None, key: str) -> str:
    if not items:
        return ""
    return str(items[0].get(key) or "").strip()


def normalize_indian_phone(value: str) -> str:
    digits = sub(r"\D", "", value or "")
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    if len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    return digits if len(digits) == 10 else ""


def parse_google_person(person: dict) -> ParsedGoogleContact | None:
    names = person.get("names") or []
    primary_name = names[0] if names else {}
    name = str(primary_name.get("displayName") or "").strip()
    if not name:
        name = " ".join(
            part
            for part in (primary_name.get("givenName"), primary_name.get("familyName"))
            if part
        ).strip()
    phones = person.get("phoneNumbers") or []
    phone = normalize_indian_phone(first_value(phones, "canonicalForm") or first_value(phones, "value"))
    email = first_value(person.get("emailAddresses"), "value").lower()
    company = first_value(person.get("organizations"), "name")
    address = first_value(person.get("addresses"), "formattedValue")
    notes = first_value(person.get("biographies"), "value")
    if not name or (not phone and not email):
        return None
    return ParsedGoogleContact(
        name=name,
        phone=phone,
        whatsapp=phone,
        email=email,
        company=company,
        address=address,
        notes=notes,
        google_resource_name=str(person.get("resourceName") or "").strip(),
        google_etag=str(person.get("etag") or "").strip(),
    )


def fetch_google_people(credentials: GoogleCredentials) -> list[dict]:
    access_token = google_token(credentials)
    people: list[dict] = []
    page_token = ""
    while True:
        query = {
            "personFields": PERSON_FIELDS,
            "pageSize": "1000",
        }
        if page_token:
            query["pageToken"] = page_token
        data = google_api_request("GET", f"{PEOPLE_CONNECTIONS_URL}?{urlencode(query)}", access_token)
        people.extend(data.get("connections") or [])
        page_token = data.get("nextPageToken") or ""
        if not page_token:
            break
    return people


def contact_conflict(session: Session, contact: ParsedGoogleContact, exclude_id: int | None = None) -> Contact | None:
    contacts = session.exec(select(Contact)).all()
    for existing in contacts:
        if exclude_id is not None and existing.id == exclude_id:
            continue
        if contact.phone and contact.phone in {existing.phone, existing.whatsapp}:
            return existing
        if contact.email and existing.email and contact.email == existing.email:
            return existing
    return None


def find_google_match(session: Session, contact: ParsedGoogleContact) -> Contact | None:
    if contact.google_resource_name:
        existing = session.exec(select(Contact).where(Contact.google_resource_name == contact.google_resource_name)).first()
        if existing:
            return existing
    normalized_name = contact.name.strip().casefold()
    return next(
        (existing for existing in session.exec(select(Contact)).all() if existing.name.strip().casefold() == normalized_name),
        None,
    )


def upsert_google_contacts(session: Session, contacts: list[ParsedGoogleContact], dry_run: bool = False) -> dict:
    created = 0
    updated = 0
    skipped = 0
    for item in contacts:
        existing = find_google_match(session, item)
        if existing:
            conflict = contact_conflict(session, item, exclude_id=existing.id)
            if conflict:
                skipped += 1
                continue
            if not dry_run:
                existing.phone = item.phone or existing.phone
                existing.whatsapp = existing.whatsapp or item.whatsapp or item.phone
                existing.email = item.email or existing.email
                existing.company = item.company or existing.company
                existing.address = item.address or existing.address
                existing.notes = item.notes or existing.notes
                existing.google_resource_name = item.google_resource_name or existing.google_resource_name
                existing.google_etag = item.google_etag or existing.google_etag
                existing.active = True
                existing.updated_at = datetime.now()
                session.add(existing)
            updated += 1
            continue
        if contact_conflict(session, item):
            skipped += 1
            continue
        if not dry_run:
            session.add(
                Contact(
                    name=item.name,
                    phone=item.phone,
                    whatsapp=item.whatsapp or item.phone,
                    email=item.email,
                    company=item.company,
                    address=item.address,
                    notes=item.notes,
                    google_resource_name=item.google_resource_name,
                    google_etag=item.google_etag,
                    updated_at=datetime.now(),
                )
            )
        created += 1
    if not dry_run:
        session.add(
            ActivityLog(
                action="SYNCED",
                entity_type="contact",
                summary=f"Google contacts sync: {created} created, {updated} updated, {skipped} skipped",
                details="One-way import from Google Contacts",
            )
        )
        session.commit()
    return {"success": True, "created": created, "updated": updated, "skipped": skipped, "total": len(contacts), "dry_run": dry_run}


def build_google_person(contact: Contact) -> dict:
    name_parts = contact.name.split()
    name = {"givenName": name_parts[0] if name_parts else contact.name}
    if len(name_parts) > 1:
        name["familyName"] = " ".join(name_parts[1:])
    person: dict[str, list[dict]] = {"names": [name]}
    phone = contact.whatsapp or contact.phone
    if phone:
        person["phoneNumbers"] = [{"value": f"+91 {phone}"}]
    if contact.email:
        person["emailAddresses"] = [{"value": contact.email}]
    if contact.company:
        person["organizations"] = [{"name": contact.company}]
    if contact.address:
        person["addresses"] = [{"formattedValue": contact.address}]
    if contact.notes:
        person["biographies"] = [{"value": contact.notes, "contentType": "TEXT_PLAIN"}]
    return person


def create_google_contact(access_token: str, contact: Contact) -> dict:
    url = f"{PEOPLE_CREATE_CONTACT_URL}?{urlencode({'personFields': PERSON_FIELDS})}"
    return google_api_request("POST", url, access_token, build_google_person(contact))


def sync_google_contacts(session: Session, dry_run: bool = False, credentials_path: Path | None = None) -> dict:
    credentials = load_google_credentials(credentials_path)
    parsed = [contact for contact in (parse_google_person(person) for person in fetch_google_people(credentials)) if contact]
    return upsert_google_contacts(session, parsed, dry_run=dry_run)


def push_gpa_contacts_to_google(session: Session, dry_run: bool = False, credentials_path: Path | None = None) -> dict:
    credentials = load_google_credentials(credentials_path)
    contacts = session.exec(select(Contact).where(Contact.active == True).order_by(Contact.name)).all()  # noqa: E712
    missing = [contact for contact in contacts if not contact.google_resource_name and (contact.phone or contact.whatsapp or contact.email)]
    created = 0
    skipped = 0
    access_token = "" if dry_run else google_token(credentials)
    for contact in missing:
        if dry_run:
            created += 1
            continue
        result = create_google_contact(access_token, contact)
        resource_name = str(result.get("resourceName") or "").strip()
        if not resource_name:
            skipped += 1
            continue
        contact.google_resource_name = resource_name
        contact.google_etag = str(result.get("etag") or "").strip()
        contact.updated_at = datetime.now()
        session.add(contact)
        created += 1
    if not dry_run:
        session.add(
            ActivityLog(
                action="SYNCED",
                entity_type="contact",
                summary=f"Google contacts push: {created} created, {skipped} skipped",
                details="Created missing Google Contacts from GPA contacts",
            )
        )
        session.commit()
    return {"success": True, "created": created, "updated": 0, "skipped": skipped, "total": len(missing), "dry_run": dry_run}
