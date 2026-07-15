import base64
from dataclasses import dataclass
from datetime import datetime
from os import getenv
from pathlib import Path
from re import sub
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen
from xml.etree import ElementTree

from sqlmodel import Session, select

from backend.models.activity import ActivityLog
from backend.models.contact import Contact


DEFAULT_SYNC_FILE = "/opt/gpa-v3/secrets/icloud_contacts.env"
ICLOUD_CARDDAV_ROOT = "https://contacts.icloud.com/"
NS = {
    "d": "DAV:",
    "card": "urn:ietf:params:xml:ns:carddav",
}


@dataclass
class ICloudCredentials:
    apple_id: str
    app_specific_password: str


@dataclass
class ParsedContact:
    name: str
    phone: str = ""
    whatsapp: str = ""
    email: str = ""
    company: str = ""
    address: str = ""
    notes: str = ""


def sync_credentials_path() -> Path:
    return Path(getenv("GPA_ICLOUD_CONTACTS_FILE", DEFAULT_SYNC_FILE))


def load_key_value_file(path: Path) -> dict[str, str]:
    if not path.exists():
        raise FileNotFoundError(f"iCloud contacts credentials file not found: {path}")
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        clean = line.strip()
        if not clean or clean.startswith("#") or "=" not in clean:
            continue
        key, value = clean.split("=", 1)
        values[key.strip().upper()] = value.strip()
    return values


def load_icloud_credentials(path: Path | None = None) -> ICloudCredentials:
    values = load_key_value_file(path or sync_credentials_path())
    apple_id = values.get("APPLE_ID", "")
    password = values.get("APP_SPECIFIC_PASSWORD", "")
    if not apple_id or not password:
        raise ValueError("APPLE_ID and APP_SPECIFIC_PASSWORD are required for iCloud contacts sync")
    return ICloudCredentials(apple_id=apple_id, app_specific_password=password)


def carddav_request(credentials: ICloudCredentials, method: str, url: str, body: str = "", depth: str = "0") -> bytes:
    auth = base64.b64encode(f"{credentials.apple_id}:{credentials.app_specific_password}".encode("utf-8")).decode("ascii")
    headers = {
        "Authorization": f"Basic {auth}",
        "Content-Type": "application/xml; charset=utf-8",
        "Depth": depth,
        "User-Agent": "GPA-V3-Contacts-Sync/1.0",
    }
    request = Request(url, data=body.encode("utf-8") if body else None, headers=headers, method=method)
    try:
        with urlopen(request, timeout=45) as response:
            return response.read()
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"iCloud CardDAV request failed: HTTP {error.code} {detail[:250]}") from error
    except URLError as error:
        raise RuntimeError(f"iCloud CardDAV connection failed: {error.reason}") from error


def first_href(xml_bytes: bytes, xpath: str) -> str:
    root = ElementTree.fromstring(xml_bytes)
    href = root.find(xpath, NS)
    return href.text.strip() if href is not None and href.text else ""


def discover_addressbook_url(credentials: ICloudCredentials) -> str:
    principal_body = """<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop><d:current-user-principal /></d:prop>
</d:propfind>"""
    principal_response = carddav_request(credentials, "PROPFIND", urljoin(ICLOUD_CARDDAV_ROOT, ".well-known/carddav"), principal_body)
    principal_href = first_href(principal_response, ".//d:current-user-principal/d:href")
    if not principal_href:
        raise RuntimeError("Could not discover iCloud CardDAV principal")

    home_body = """<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:prop><card:addressbook-home-set /></d:prop>
</d:propfind>"""
    home_response = carddav_request(credentials, "PROPFIND", urljoin(ICLOUD_CARDDAV_ROOT, principal_href), home_body)
    home_href = first_href(home_response, ".//card:addressbook-home-set/d:href")
    if not home_href:
        raise RuntimeError("Could not discover iCloud address book home")

    books_body = """<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop><d:resourcetype /><d:displayname /></d:prop>
</d:propfind>"""
    books_response = carddav_request(credentials, "PROPFIND", urljoin(ICLOUD_CARDDAV_ROOT, home_href), books_body, depth="1")
    root = ElementTree.fromstring(books_response)
    fallback = ""
    for response in root.findall("d:response", NS):
        href = response.find("d:href", NS)
        if href is None or not href.text:
            continue
        href_text = href.text.strip()
        if not fallback and href_text != home_href:
            fallback = href_text
        if response.find(".//d:resourcetype/card:addressbook", NS) is not None:
            return urljoin(ICLOUD_CARDDAV_ROOT, href_text)
    if fallback:
        return urljoin(ICLOUD_CARDDAV_ROOT, fallback)
    raise RuntimeError("No iCloud address book was found")


def fetch_vcards(credentials: ICloudCredentials) -> list[str]:
    addressbook_url = discover_addressbook_url(credentials)
    report_body = """<?xml version="1.0" encoding="utf-8"?>
<card:addressbook-query xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:prop>
    <d:getetag />
    <card:address-data />
  </d:prop>
</card:addressbook-query>"""
    report_response = carddav_request(credentials, "REPORT", addressbook_url, report_body, depth="1")
    root = ElementTree.fromstring(report_response)
    cards = []
    for node in root.findall(".//card:address-data", NS):
        if node.text and node.text.strip():
            cards.append(node.text)
    return cards


def unfold_vcard_lines(vcard: str) -> list[str]:
    lines: list[str] = []
    for raw_line in vcard.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if raw_line.startswith((" ", "\t")) and lines:
            lines[-1] += raw_line[1:]
        elif raw_line:
            lines.append(raw_line)
    return lines


def clean_vcard_value(value: str) -> str:
    return value.replace("\\n", " ").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\").strip()


def vcard_value(lines: Iterable[str], names: tuple[str, ...]) -> str:
    for line in lines:
        key, _, value = line.partition(":")
        key_name = key.split(";", 1)[0].upper()
        if key_name in names:
            return clean_vcard_value(value)
    return ""


def normalize_indian_phone(value: str) -> str:
    digits = sub(r"\D", "", value or "")
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    if len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    return digits if len(digits) == 10 else ""


def parse_vcard(vcard: str) -> ParsedContact | None:
    lines = unfold_vcard_lines(vcard)
    name = vcard_value(lines, ("FN",))
    if not name:
        name_parts = [part for part in vcard_value(lines, ("N",)).split(";") if part.strip()]
        name = " ".join(reversed(name_parts[:2])).strip()
    phone = normalize_indian_phone(vcard_value(lines, ("TEL",)))
    email = vcard_value(lines, ("EMAIL",)).lower()
    company = vcard_value(lines, ("ORG",))
    address = " ".join(part for part in vcard_value(lines, ("ADR",)).replace(";", " ").split() if part)
    notes = vcard_value(lines, ("NOTE",))
    if not name or (not phone and not email):
        return None
    return ParsedContact(name=name, phone=phone, email=email, company=company, address=address, notes=notes)


def contact_conflict(session: Session, contact: ParsedContact, exclude_id: int | None = None) -> Contact | None:
    contacts = session.exec(select(Contact)).all()
    for existing in contacts:
        if exclude_id is not None and existing.id == exclude_id:
            continue
        if contact.phone and contact.phone in {existing.phone, existing.whatsapp}:
            return existing
        if contact.email and existing.email and contact.email == existing.email:
            return existing
    return None


def upsert_contacts(session: Session, contacts: list[ParsedContact], dry_run: bool = False) -> dict:
    created = 0
    updated = 0
    skipped = 0
    for item in contacts:
        existing = next((contact for contact in session.exec(select(Contact)).all() if contact.name.strip().casefold() == item.name.strip().casefold()), None)
        if existing:
            conflict = contact_conflict(session, item, exclude_id=existing.id)
            if conflict:
                skipped += 1
                continue
            if not dry_run:
                existing.phone = item.phone or existing.phone
                existing.whatsapp = existing.whatsapp or item.phone
                existing.email = item.email or existing.email
                existing.company = item.company or existing.company
                existing.address = item.address or existing.address
                existing.notes = item.notes or existing.notes
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
                    whatsapp=item.phone,
                    email=item.email,
                    company=item.company,
                    address=item.address,
                    notes=item.notes,
                    updated_at=datetime.now(),
                )
            )
        created += 1
    if not dry_run:
        session.add(
            ActivityLog(
                action="SYNCED",
                entity_type="contact",
                summary=f"iCloud contacts sync: {created} created, {updated} updated, {skipped} skipped",
                details="One-way import from iCloud Contacts",
            )
        )
        session.commit()
    return {"success": True, "created": created, "updated": updated, "skipped": skipped, "total": len(contacts), "dry_run": dry_run}


def sync_icloud_contacts(session: Session, dry_run: bool = False, credentials_path: Path | None = None) -> dict:
    credentials = load_icloud_credentials(credentials_path)
    parsed = [contact for contact in (parse_vcard(vcard) for vcard in fetch_vcards(credentials)) if contact]
    return upsert_contacts(session, parsed, dry_run=dry_run)
