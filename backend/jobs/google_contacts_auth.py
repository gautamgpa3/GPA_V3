import argparse
import json
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen

from backend.services.google_contacts import TOKEN_URL, load_key_value_file, sync_credentials_path

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
CONTACTS_SCOPE = "https://www.googleapis.com/auth/contacts"
DEFAULT_REDIRECT_URI = "https://developers.google.com/oauthplayground"


def authorization_url(client_id: str, redirect_uri: str) -> str:
    query = urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": CONTACTS_SCOPE,
            "access_type": "offline",
            "prompt": "consent",
        }
    )
    return f"{AUTH_URL}?{query}"


def extract_code(value: str) -> str:
    clean = value.strip()
    if not clean:
        return ""
    if "code=" not in clean:
        return clean
    parsed = urlparse(clean)
    return (parse_qs(parsed.query).get("code") or [""])[0].strip()


def exchange_code(client_id: str, client_secret: str, redirect_uri: str, code: str) -> dict:
    body = urlencode(
        {
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "code": code,
            "grant_type": "authorization_code",
        }
    ).encode("utf-8")
    request = Request(TOKEN_URL, data=body, headers={"Content-Type": "application/x-www-form-urlencoded"}, method="POST")
    try:
        with urlopen(request, timeout=45) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"Google OAuth code exchange failed: HTTP {error.code} {detail[:500]}") from error
    except URLError as error:
        raise RuntimeError(f"Google OAuth code exchange connection failed: {error.reason}") from error


def write_refresh_token(path: Path, refresh_token: str) -> None:
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    found = False
    next_lines = []
    for line in lines:
        if line.strip().upper().startswith("REFRESH_TOKEN="):
            next_lines.append(f"REFRESH_TOKEN={refresh_token}")
            found = True
        else:
            next_lines.append(line)
    if not found:
        next_lines.append(f"REFRESH_TOKEN={refresh_token}")
    path.write_text("\n".join(next_lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a Google Contacts OAuth refresh token for GPA V3.")
    parser.add_argument("--credentials-file", default=str(sync_credentials_path()), help="Path to google_contacts.env")
    parser.add_argument("--redirect-uri", default=DEFAULT_REDIRECT_URI, help="OAuth redirect URI configured in Google Cloud")
    parser.add_argument("--code", default="", help="Authorization code or full redirected URL")
    parser.add_argument("--write", action="store_true", help="Write the new REFRESH_TOKEN back to the credentials file")
    args = parser.parse_args()

    path = Path(args.credentials_file)
    values = load_key_value_file(path)
    client_id = values.get("CLIENT_ID", "")
    client_secret = values.get("CLIENT_SECRET", "")
    if not client_id or not client_secret:
        raise SystemExit(f"CLIENT_ID and CLIENT_SECRET are required in {path}")

    print("Open this URL in your browser and allow Google Contacts access:\n")
    print(authorization_url(client_id, args.redirect_uri))
    print("\nAfter approval, paste the authorization code or full redirected URL below.")
    code = extract_code(args.code or input("Code / URL: "))
    if not code:
        raise SystemExit("No authorization code provided")

    data = exchange_code(client_id, client_secret, args.redirect_uri, code)
    refresh_token = data.get("refresh_token", "")
    if not refresh_token:
        raise SystemExit("Google did not return a refresh token. Make sure prompt=consent was used and try again.")

    print("\nNew REFRESH_TOKEN:\n")
    print(refresh_token)
    if args.write:
        write_refresh_token(path, refresh_token)
        print(f"\nUpdated {path}")


if __name__ == "__main__":
    main()
