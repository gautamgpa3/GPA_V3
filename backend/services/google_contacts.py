import json
from dataclasses import dataclass
from datetime import date, datetime
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
PERSON_FIELDS = "names,emailAddresses,phoneNumbers,organizations,addresses,biographies,birthdays,events,relations,urls,metadata"


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


def parse_google_person(person: dict) -> ParsedGoogleContact | None:
    names = person.get("names") or []
    primary_name = names[0] if names else {}
    first_name = str(primary_name.get("givenName") or "").strip()
    last_name = str(primary_name.get("familyName") or "").strip()
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


def upsert_google_contacts(session: Session, contacts: list[ParsedGoogleContact], dry_run: bool = False) -> dict:
    created = 0
    updated = 0
    skipped = 0
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
                existing.name = item.name or existing.name
                existing.first_name = item.first_name
                existing.last_name = item.last_name
                existing.phone = item.phone
                existing.phone_label = item.phone_label or "Mobile"
                existing.whatsapp = item.whatsapp or item.phone
                existing.whatsapp_label = item.whatsapp_label or "WhatsApp"
                existing.email = item.email
                existing.company = item.company
                existing.address = item.address
                existing.location_url = item.location_url
                existing.birth_date = item.birth_date
                existing.important_date = item.important_date
                existing.important_date_label = item.important_date_label
                existing.related_name = item.related_name
                existing.social_profile = item.social_profile
                existing.notes = item.notes
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
    active_contacts = len(session.exec(select(Contact).where(Contact.active == True)).all())  # noqa: E712
    return {
        "success": True,
        "created": created,
        "updated": updated,
        "updated_contacts": len(updated_contact_ids),
        "merged_google_contacts": merged_google_contacts,
        "skipped": skipped,
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
    name_parts = contact.name.split()
    name = {"givenName": contact.first_name or (name_parts[0] if name_parts else contact.name)}
    family_name = contact.last_name or (" ".join(name_parts[1:]) if len(name_parts) > 1 else "")
    if family_name:
        name["familyName"] = family_name
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
    return upsert_google_contacts(session, [match], dry_run=dry_run)


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
