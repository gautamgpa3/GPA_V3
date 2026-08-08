import json
from dataclasses import dataclass
from datetime import date, datetime
from os import getenv
from pathlib import Path
from re import sub
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from backend.models.activity import ActivityLog
from backend.models.client import Client
from backend.models.contact import Contact


DEFAULT_SYNC_FILE = "/opt/gpa-v3/secrets/google_contacts.env"
TOKEN_URL = "https://oauth2.googleapis.com/token"
PEOPLE_CONNECTIONS_URL = "https://people.googleapis.com/v1/people/me/connections"
PEOPLE_CREATE_CONTACT_URL = "https://people.googleapis.com/v1/people:createContact"
PERSON_FIELDS = "names,emailAddresses,phoneNumbers,organizations,addresses,biographies,birthdays,events,relations,urls,metadata"
UPDATE_PERSON_FIELDS = "names,emailAddresses,phoneNumbers,organizations,addresses,biographies,birthdays,events,relations,urls"
PERSONAL_BIRTHDATE_CONSTITUTIONS = {"Individual", "Proprietorship"}
GOOGLE_SYNC_FIELDS = [
    "name",
    "first_name",
    "last_name",
    "phone",
    "phone_label",
    "whatsapp",
    "whatsapp_label",
    "email",
    "company",
    "address",
    "location_url",
    "birth_date",
    "important_date",
    "important_date_label",
    "related_name",
    "social_profile",
    "notes",
]


@dataclass
class GoogleCredentials:
    client_id: str
    client_secret: str
    refresh_token: str


@dataclass
class ParsedGoogleContact:
    name: str
    first_name: str = ""
    last_name: str = ""
    phone: str = ""
    phone_label: str = "Mobile"
    whatsapp: str = ""
    whatsapp_label: str = "WhatsApp"
    email: str = ""
    company: str = ""
    address: str = ""
    location_url: str = ""
    birth_date: date | None = None
    important_date: date | None = None
    important_date_label: str = ""
    related_name: str = ""
    social_profile: str = ""
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


def google_date(value: dict | None) -> date | None:
    if not value or not value.get("month") or not value.get("day"):
        return None
    year = int(value.get("year") or 1900)
    try:
        return date(year, int(value["month"]), int(value["day"]))
    except ValueError:
        return None


def google_label(items: list[dict] | None, fallback: str) -> str:
    if not items:
        return fallback
    return str(items[0].get("formattedType") or items[0].get("type") or fallback).strip() or fallback


def clean_google_name_parts(first_name: str, last_name: str) -> tuple[str, str]:
    first_name = " ".join(first_name.split())
    last_name = " ".join(last_name.split())
    if first_name and last_name and first_name.casefold().endswith(f" {last_name.casefold()}"):
        return first_name, ""
    if first_name and last_name and first_name.casefold() == last_name.casefold():
        return first_name, ""
    return first_name, last_name


def parse_google_person(person: dict) -> ParsedGoogleContact | None:
    names = person.get("names") or []
    primary_name = names[0] if names else {}
    first_name = str(primary_name.get("givenName") or "").strip()
    last_name = str(primary_name.get("familyName") or "").strip()
    first_name, last_name = clean_google_name_parts(first_name, last_name)
    name = str(primary_name.get("displayName") or "").strip()
    if not name:
        name = " ".join(part for part in (first_name, last_name) if part).strip()
    phones = person.get("phoneNumbers") or []
    phone = normalize_indian_phone(first_value(phones, "canonicalForm") or first_value(phones, "value"))
    email = first_value(person.get("emailAddresses"), "value").lower()
    company = first_value(person.get("organizations"), "name")
    address = first_value(person.get("addresses"), "formattedValue")
    notes = first_value(person.get("biographies"), "value")
    urls = person.get("urls") or []
    birthdays = person.get("birthdays") or []
    events = person.get("events") or []
    relations = person.get("relations") or []
    if not name:
        return None
    return ParsedGoogleContact(
        name=name,
        first_name=first_name,
        last_name=last_name,
        phone=phone,
        phone_label=google_label(phones, "Mobile"),
        whatsapp=phone,
        whatsapp_label="WhatsApp",
        email=email,
        company=company,
        address=address,
        birth_date=google_date((birthdays[0] if birthdays else {}).get("date")),
        important_date=google_date((events[0] if events else {}).get("date")),
        important_date_label=google_label(events, "Other date") if events else "",
        related_name=first_value(relations, "person"),
        social_profile=first_value(urls, "value"),
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
        if not existing.active:
            continue
        if contact.phone and contact.phone in {existing.phone, existing.whatsapp}:
            return existing
        if contact.email and existing.email and contact.email == existing.email:
            return existing
        if contact.name and existing.name.strip().casefold() == contact.name.strip().casefold():
            return existing
    return None


def find_google_match(session: Session, contact: ParsedGoogleContact) -> Contact | None:
    if contact.google_resource_name:
        existing = session.exec(select(Contact).where(Contact.google_resource_name == contact.google_resource_name)).first()
        if existing:
            return existing
    contacts = session.exec(select(Contact)).all()
    if contact.phone:
        existing = next((item for item in contacts if contact.phone in {item.phone, item.whatsapp}), None)
        if existing:
            return existing
    if contact.email:
        existing = next((item for item in contacts if item.email and item.email == contact.email), None)
        if existing:
            return existing
    normalized_name = contact.name.strip().casefold()
    return next((existing for existing in contacts if existing.name.strip().casefold() == normalized_name), None)


def sync_value(value) -> str:
    if value is None:
        return ""
    if isinstance(value, date):
        return value.isoformat()
    return str(value or "").strip()


def google_snapshot_values(item: ParsedGoogleContact | Contact) -> dict[str, str]:
    return {field: sync_value(getattr(item, field, "")) for field in GOOGLE_SYNC_FIELDS}


def load_google_snapshot(contact: Contact) -> dict[str, str]:
    if not contact.google_sync_snapshot:
        return {}
    try:
        snapshot = json.loads(contact.google_sync_snapshot)
    except json.JSONDecodeError:
        return {}
    if not isinstance(snapshot, dict):
        return {}
    return {field: sync_value(snapshot.get(field, "")) for field in GOOGLE_SYNC_FIELDS}


def store_google_snapshot(contact: Contact, values: dict[str, str] | ParsedGoogleContact | Contact) -> None:
    snapshot = google_snapshot_values(values) if not isinstance(values, dict) else {field: sync_value(values.get(field, "")) for field in GOOGLE_SYNC_FIELDS}
    contact.google_sync_snapshot = json.dumps(snapshot, sort_keys=True, separators=(",", ":"))
    contact.google_last_synced_at = datetime.now()


def set_contact_field_from_google(contact: Contact, field: str, value: str) -> None:
    if field in {"birth_date", "important_date"}:
        setattr(contact, field, date.fromisoformat(value) if value else None)
        return
    setattr(contact, field, value)


def apply_google_contact(contact: Contact, item: ParsedGoogleContact) -> list[str]:
    conflicts: list[str] = []
    previous_google = load_google_snapshot(contact)
    incoming_google = google_snapshot_values(item)
    current_local = google_snapshot_values(contact)

    for field in GOOGLE_SYNC_FIELDS:
        google_value = incoming_google[field]
        local_value = current_local[field]
        previous_value = previous_google.get(field, "") if previous_google else ""
        local_changed = bool(previous_google) and local_value != previous_value
        google_changed = (not previous_google and bool(google_value)) or google_value != previous_value
        both_changed = local_changed and google_changed and local_value != google_value
        if both_changed:
            conflicts.append(field)
    if conflicts:
        return conflicts

    for field in GOOGLE_SYNC_FIELDS:
        google_value = incoming_google[field]
        previous_value = previous_google.get(field, "") if previous_google else ""
        google_changed = (not previous_google and bool(google_value)) or google_value != previous_value
        if google_changed:
            if google_value or previous_value:
                set_contact_field_from_google(contact, field, google_value)

    contact.google_resource_name = item.google_resource_name or contact.google_resource_name
    contact.google_etag = item.google_etag or contact.google_etag
    contact.active = True
    contact.updated_at = datetime.now()
    store_google_snapshot(contact, incoming_google)
    return []


def google_push_conflicts(contact: Contact, google_contact: ParsedGoogleContact | None) -> list[str]:
    if not google_contact:
        return []
    previous_google = load_google_snapshot(contact)
    if not previous_google:
        return ["initial Google snapshot missing"]
    incoming_google = google_snapshot_values(google_contact)
    current_local = google_snapshot_values(contact)
    conflicts: list[str] = []
    for field in GOOGLE_SYNC_FIELDS:
        google_changed = incoming_google[field] != previous_google.get(field, "")
        local_changed = current_local[field] != previous_google.get(field, "")
        if google_changed:
            conflicts.append(field if local_changed else f"{field} changed in Google")
    return conflicts


def deleted_contact_name(session: Session, contact: Contact) -> str:
    base = f"{contact.name} (deleted {contact.id})"
    candidate = base
    counter = 2
    names = {item.name.strip().casefold() for item in session.exec(select(Contact)).all() if item.id != contact.id}
    while candidate.strip().casefold() in names:
        candidate = f"{base}-{counter}"
        counter += 1
    return candidate


def release_inactive_google_conflicts(session: Session, target: Contact, google_contact: ParsedGoogleContact) -> None:
    contacts = session.exec(select(Contact)).all()
    target_numbers = {value for value in (google_contact.phone, google_contact.whatsapp) if value}
    target_name = google_contact.name.strip().casefold()
    target_email = google_contact.email.strip().casefold()
    target_google_id = google_contact.google_resource_name.strip()
    for existing in contacts:
        if existing.id == target.id or existing.active:
            continue
        changed = False
        if target_name and existing.name.strip().casefold() == target_name:
            existing.name = deleted_contact_name(session, existing)
            changed = True
        if target_numbers and ({existing.phone, existing.whatsapp} & target_numbers):
            existing.phone = ""
            existing.whatsapp = ""
            changed = True
        if target_email and existing.email.strip().casefold() == target_email:
            existing.email = ""
            changed = True
        if target_google_id and existing.google_resource_name == target_google_id:
            existing.google_resource_name = ""
            existing.google_etag = ""
            changed = True
        if changed:
            existing.updated_at = datetime.now()
            session.add(existing)


def sync_linked_clients_from_contact(session: Session, contact: Contact) -> None:
    linked_clients = session.exec(select(Client).where(Client.contact_id == contact.id, Client.active == True)).all()  # noqa: E712
    for client in linked_clients:
        client.phone = contact.phone or contact.whatsapp or ""
        client.whatsapp = contact.whatsapp or contact.phone or ""
        client.email = contact.email or ""
        client.address = contact.address or ""
        if client.constitution == "Proprietorship":
            client.pan_no = contact.pan_no or ""
        if client.constitution in PERSONAL_BIRTHDATE_CONSTITUTIONS:
            client.birth_date = contact.birth_date
        client.updated_at = datetime.now()
        session.add(client)


def upsert_google_contacts(session: Session, contacts: list[ParsedGoogleContact], dry_run: bool = False) -> dict:
    created = 0
    updated = 0
    skipped = 0
    field_conflicts = 0
    updated_contact_ids: set[int] = set()
    merged_google_contacts = 0
    for item in contacts:
        existing = find_google_match(session, item)
        if existing:
            conflict = contact_conflict(session, item, exclude_id=existing.id)
            if conflict:
                skipped += 1
                continue
            if existing.id in updated_contact_ids:
                merged_google_contacts += 1
            elif existing.id is not None:
                updated_contact_ids.add(existing.id)
            if not dry_run:
                release_inactive_google_conflicts(session, existing, item)
                conflicts = apply_google_contact(existing, item)
                if conflicts:
                    field_conflicts += 1
                    skipped += 1
                    continue
                session.add(existing)
                sync_linked_clients_from_contact(session, existing)
            updated += 1
            continue
        if contact_conflict(session, item):
            skipped += 1
            continue
        if not dry_run:
            contact = Contact(
                name=item.name,
                first_name=item.first_name,
                last_name=item.last_name,
                phone=item.phone,
                phone_label=item.phone_label,
                whatsapp=item.whatsapp or item.phone,
                whatsapp_label=item.whatsapp_label,
                email=item.email,
                company=item.company,
                address=item.address,
                location_url=item.location_url,
                birth_date=item.birth_date,
                important_date=item.important_date,
                important_date_label=item.important_date_label,
                related_name=item.related_name,
                social_profile=item.social_profile,
                notes=item.notes,
                google_resource_name=item.google_resource_name,
                google_etag=item.google_etag,
                updated_at=datetime.now(),
            )
            store_google_snapshot(contact, item)
            session.add(contact)
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
        try:
            session.commit()
        except IntegrityError as error:
            session.rollback()
            raise RuntimeError("Google contacts sync could not be saved because duplicate contact data already exists in GPA.") from error
    active_contacts = len(session.exec(select(Contact).where(Contact.active == True)).all())  # noqa: E712
    return {
        "success": True,
        "created": created,
        "updated": updated,
        "updated_contacts": len(updated_contact_ids),
        "merged_google_contacts": merged_google_contacts,
        "skipped": skipped,
        "field_conflicts": field_conflicts,
        "visible_contacts": active_contacts,
        "total": len(contacts),
        "dry_run": dry_run,
    }


def google_person_date(value: date | None) -> dict | None:
    if not value:
        return None
    body = {"month": value.month, "day": value.day}
    if value.year != 1900:
        body["year"] = value.year
    return {"date": body}


def build_google_person(contact: Contact) -> dict:
    name: dict[str, str] = {}
    if contact.first_name:
        name["givenName"] = contact.first_name
    if contact.last_name:
        name["familyName"] = contact.last_name
    if not name:
        name["givenName"] = contact.name
    person: dict[str, list[dict]] = {"names": [name]}
    phone = contact.whatsapp or contact.phone
    if phone:
        person["phoneNumbers"] = [{"value": f"+91 {phone}", "type": (contact.phone_label or "mobile").lower()}]
    if contact.email:
        person["emailAddresses"] = [{"value": contact.email}]
    if contact.company:
        person["organizations"] = [{"name": contact.company}]
    if contact.address:
        person["addresses"] = [{"formattedValue": contact.address}]
    if contact.birth_date:
        person["birthdays"] = [google_person_date(contact.birth_date)]
    if contact.important_date:
        person["events"] = [{**google_person_date(contact.important_date), "type": "other"}]
    if contact.related_name:
        person["relations"] = [{"person": contact.related_name, "type": "other"}]
    urls = []
    if contact.social_profile:
        urls.append({"value": contact.social_profile, "type": "profile"})
    if contact.location_url:
        urls.append({"value": contact.location_url, "type": "home"})
    if urls:
        person["urls"] = urls
    if contact.notes:
        person["biographies"] = [{"value": contact.notes, "contentType": "TEXT_PLAIN"}]
    return person


def create_google_contact(access_token: str, contact: Contact) -> dict:
    url = f"{PEOPLE_CREATE_CONTACT_URL}?{urlencode({'personFields': PERSON_FIELDS})}"
    return google_api_request("POST", url, access_token, build_google_person(contact))


def google_update_fields(person: dict) -> str:
    return ",".join(field for field in UPDATE_PERSON_FIELDS.split(",") if field in person)


def update_google_contact(access_token: str, contact: Contact) -> dict:
    if not contact.google_resource_name:
        raise RuntimeError("Google contact ID is missing. Pull from Google first or create this contact in Google.")
    if not contact.google_etag:
        raise RuntimeError(f"Google etag is missing for {contact.name}. Pull from Google before updating it.")
    person = build_google_person(contact)
    update_fields = google_update_fields(person)
    if not update_fields:
        raise RuntimeError(f"{contact.name} has no syncable details for Google.")
    person["etag"] = contact.google_etag
    resource_name = quote(contact.google_resource_name, safe="/")
    query = urlencode({"updatePersonFields": update_fields, "personFields": PERSON_FIELDS})
    return google_api_request("PATCH", f"https://people.googleapis.com/v1/{resource_name}:updateContact?{query}", access_token, person)


def sync_google_contacts(session: Session, dry_run: bool = False, credentials_path: Path | None = None) -> dict:
    credentials = load_google_credentials(credentials_path)
    people = fetch_google_people(credentials)
    parsed = [contact for contact in (parse_google_person(person) for person in people) if contact]
    result = upsert_google_contacts(session, parsed, dry_run=dry_run)
    result["google_fetched"] = len(people)
    result["google_parsed"] = len(parsed)
    result["google_unparseable"] = len(people) - len(parsed)
    return result


def audit_search_match(contact: ParsedGoogleContact, query: str) -> bool:
    clean_query = query.strip().casefold()
    query_digits = sub(r"\D", "", query or "")
    haystack = " ".join(
        [
            contact.name,
            contact.first_name,
            contact.last_name,
            contact.phone,
            contact.whatsapp,
            contact.email,
            contact.company,
        ]
    ).casefold()
    if clean_query and clean_query in haystack:
        return True
    return bool(query_digits and query_digits in f"{contact.phone}{contact.whatsapp}")


def contact_match_reason(google_contact: ParsedGoogleContact, gpa_contact: Contact | None) -> str:
    if not gpa_contact:
        return "No GPA contact matched by Google ID, phone, email, or name."
    if google_contact.google_resource_name and google_contact.google_resource_name == gpa_contact.google_resource_name:
        return "Matched by Google contact ID."
    if google_contact.phone and google_contact.phone in {gpa_contact.phone, gpa_contact.whatsapp}:
        return "Matched by phone or WhatsApp number."
    if google_contact.email and gpa_contact.email and google_contact.email == gpa_contact.email:
        return "Matched by email."
    if google_contact.name.strip().casefold() == gpa_contact.name.strip().casefold():
        return "Matched by name."
    return "Matched by duplicate protection."


def audit_contact_result(session: Session, google_contact: ParsedGoogleContact) -> dict:
    gpa_contact = find_google_match(session, google_contact)
    if not gpa_contact:
        status = "missing_from_gpa"
    elif not gpa_contact.active:
        status = "inactive_in_gpa"
    elif google_contact.google_resource_name and gpa_contact.google_resource_name and google_contact.google_resource_name != gpa_contact.google_resource_name:
        status = "merged_with_existing_gpa_contact"
    else:
        status = "visible_in_gpa"
    return {
        "status": status,
        "reason": contact_match_reason(google_contact, gpa_contact),
        "google": {
            "name": google_contact.name,
            "phone": google_contact.phone,
            "email": google_contact.email,
            "company": google_contact.company,
            "resource_name": google_contact.google_resource_name,
        },
        "gpa": {
            "id": gpa_contact.id if gpa_contact else None,
            "name": gpa_contact.name if gpa_contact else "",
            "phone": gpa_contact.phone if gpa_contact else "",
            "whatsapp": gpa_contact.whatsapp if gpa_contact else "",
            "email": gpa_contact.email if gpa_contact else "",
            "company": gpa_contact.company if gpa_contact else "",
            "active": gpa_contact.active if gpa_contact else False,
            "resource_name": gpa_contact.google_resource_name if gpa_contact else "",
        },
    }


def audit_google_contacts(session: Session, query: str = "", limit: int = 25, credentials_path: Path | None = None) -> dict:
    credentials = load_google_credentials(credentials_path)
    people = fetch_google_people(credentials)
    parsed = [contact for contact in (parse_google_person(person) for person in people) if contact]
    matches = [contact for contact in parsed if not query.strip() or audit_search_match(contact, query)]
    results = [audit_contact_result(session, contact) for contact in matches[: max(1, limit)]]
    return {
        "success": True,
        "query": query,
        "google_fetched": len(people),
        "google_parsed": len(parsed),
        "google_matches": len(matches),
        "visible_contacts": len(session.exec(select(Contact).where(Contact.active == True)).all()),  # noqa: E712
        "total_contacts": len(session.exec(select(Contact)).all()),
        "results": results,
    }


def restore_google_contacts_by_query(session: Session, query: str, credentials_path: Path | None = None) -> dict:
    clean_query = query.strip()
    if not clean_query:
        return {"success": False, "created": 0, "updated": 0, "skipped": 0, "total": 0, "message": "Search text is required"}
    credentials = load_google_credentials(credentials_path)
    people = fetch_google_people(credentials)
    parsed = [contact for contact in (parse_google_person(person) for person in people) if contact]
    matches = [contact for contact in parsed if audit_search_match(contact, clean_query)]
    if not matches:
        return {
            "success": True,
            "created": 0,
            "updated": 0,
            "skipped": 0,
            "total": 0,
            "google_fetched": len(people),
            "google_parsed": len(parsed),
            "message": "No Google contact matched this search.",
        }
    result = upsert_google_contacts(session, matches)
    result["google_fetched"] = len(people)
    result["google_parsed"] = len(parsed)
    result["message"] = f"Restored/synced {len(matches)} Google contact match(es)."
    return result


def sync_single_google_contact(session: Session, contact_id: int, dry_run: bool = False, credentials_path: Path | None = None) -> dict:
    contact = session.get(Contact, contact_id)
    if not contact:
        return {"success": False, "created": 0, "updated": 0, "skipped": 1, "total": 0, "dry_run": dry_run, "message": "Contact not found"}
    credentials = load_google_credentials(credentials_path)
    people = fetch_google_people(credentials)
    parsed = [item for item in (parse_google_person(person) for person in people) if item]
    match = next((item for item in parsed if item.google_resource_name and item.google_resource_name == contact.google_resource_name), None)
    if not match and (contact.phone or contact.whatsapp):
        numbers = {value for value in (contact.phone, contact.whatsapp) if value}
        match = next((item for item in parsed if item.phone and item.phone in numbers), None)
    if not match and contact.email:
        match = next((item for item in parsed if item.email and item.email == contact.email), None)
    if not match:
        normalized_name = contact.name.strip().casefold()
        match = next((item for item in parsed if item.name.strip().casefold() == normalized_name), None)
    if not match:
        return {"success": True, "created": 0, "updated": 0, "skipped": 1, "total": 0, "dry_run": dry_run, "message": "No matching Google contact found"}
    conflict = contact_conflict(session, match, exclude_id=contact.id)
    if conflict:
        return {
            "success": True,
            "created": 0,
            "updated": 0,
            "skipped": 1,
            "total": 1,
            "dry_run": dry_run,
            "message": f"Google contact matches another active GPA contact: {conflict.name}. Please merge or edit that contact first.",
        }
    if not dry_run:
        release_inactive_google_conflicts(session, contact, match)
        conflicts = apply_google_contact(contact, match)
        if conflicts:
            return {
                "success": True,
                "created": 0,
                "updated": 0,
                "skipped": 1,
                "field_conflicts": 1,
                "conflict_fields": conflicts,
                "total": 1,
                "dry_run": dry_run,
                "message": f"Skipped {contact.name}: Google and GPA both changed {', '.join(conflicts)}. Please review manually.",
            }
        session.add(contact)
        session.add(
            ActivityLog(
                action="SYNCED",
                entity_type="contact",
                entity_id=contact.id,
                summary=f"Synced Google contact: {contact.name}",
                details="Single contact updated from Google Contacts",
            )
        )
        try:
            session.commit()
        except IntegrityError as error:
            session.rollback()
            raise RuntimeError("This Google contact could not be saved because duplicate contact data still exists in GPA.") from error
        session.refresh(contact)
    return {
        "success": True,
        "created": 0,
        "updated": 1,
        "skipped": 0,
        "total": 1,
        "dry_run": dry_run,
        "message": f"Google contact synced: {match.name}",
    }


def push_gpa_contacts_to_google(session: Session, dry_run: bool = False, credentials_path: Path | None = None) -> dict:
    credentials = load_google_credentials(credentials_path)
    contacts = session.exec(select(Contact).where(Contact.active == True).order_by(Contact.name)).all()  # noqa: E712
    syncable = [contact for contact in contacts if contact.name and (contact.phone or contact.whatsapp or contact.email)]
    missing = [contact for contact in syncable if not contact.google_resource_name]
    existing = [contact for contact in syncable if contact.google_resource_name]
    google_people = fetch_google_people(credentials) if existing else []
    google_by_resource = {
        item.google_resource_name: item
        for item in (parse_google_person(person) for person in google_people)
        if item and item.google_resource_name
    }
    created = 0
    updated = 0
    skipped = 0
    field_conflicts = 0
    access_token = "" if dry_run else google_token(credentials)
    for contact in existing:
        current_google = google_by_resource.get(contact.google_resource_name)
        conflicts = google_push_conflicts(contact, current_google)
        if conflicts:
            field_conflicts += 1
            skipped += 1
            continue
        if dry_run:
            updated += 1
            continue
        if not contact.google_etag:
            skipped += 1
            continue
        result = update_google_contact(access_token, contact)
        contact.google_etag = str(result.get("etag") or contact.google_etag or "").strip()
        contact.updated_at = datetime.now()
        parsed_result = parse_google_person(result)
        store_google_snapshot(contact, parsed_result or contact)
        session.add(contact)
        updated += 1
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
        parsed_result = parse_google_person(result)
        store_google_snapshot(contact, parsed_result or contact)
        session.add(contact)
        created += 1
    if not dry_run:
        session.add(
            ActivityLog(
                action="SYNCED",
                entity_type="contact",
                summary=f"Google contacts push: {created} created, {updated} updated, {skipped} skipped",
                details="Created missing Google Contacts and updated linked Google Contacts from GPA contacts",
            )
        )
        session.commit()
    return {
        "success": True,
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "field_conflicts": field_conflicts,
        "google_fetched": len(google_people),
        "total": len(syncable),
        "dry_run": dry_run,
    }


def sync_google_contacts_two_way(session: Session, dry_run: bool = False, credentials_path: Path | None = None) -> dict:
    pull = sync_google_contacts(session, dry_run=dry_run, credentials_path=credentials_path)
    push = push_gpa_contacts_to_google(session, dry_run=dry_run, credentials_path=credentials_path)
    return {
        "success": True,
        "dry_run": dry_run,
        "pull": pull,
        "push": push,
        "created": pull.get("created", 0) + push.get("created", 0),
        "updated": pull.get("updated", 0) + push.get("updated", 0),
        "skipped": pull.get("skipped", 0) + push.get("skipped", 0),
        "message": "Two-way Google sync completed.",
    }
