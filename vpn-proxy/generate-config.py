"""Turn a VLESS subscription link into an Xray config exposing a local proxy.

Why this exists
---------------
Telegram is filtered on the VM's link — TCP connects succeed, the actual
request then hangs until it times out. Routing that traffic through the owner's
existing VPN subscription fixes it on the VM itself, which is strictly better
than tunnelling to a proxy on the dev PC: no dependency on that PC being awake,
on its VPN being switched on, or on the Hyper-V subnet not having renumbered.

Output is an Xray config with an HTTP proxy inbound (what the bot and backend
point TELEGRAM_PROXY at), a SOCKS inbound for anything that prefers it, and one
outbound per chosen server behind a balancer with health checks — 80 servers
are on offer and individual ones do go down.

Usage
-----
    python vpn-proxy/generate-config.py --url <subscription> --out vpn-proxy/config.json

The URL is a credential: anyone holding it gets the whole subscription. Pass it
via SUBSCRIPTION_URL rather than on the command line where shell history keeps
it, and note that config.json holds the per-server keys — it is gitignored.
"""
import argparse
import base64
import json
import os
import sys
import urllib.parse
import urllib.request

DEFAULT_SERVERS = 8
PROBE_URL = "https://api.telegram.org/"


def _print(text: str) -> None:
    """Server labels come from the subscription and routinely carry flag emoji,
    which a cp1251 Windows console cannot encode — and an unhandled
    UnicodeEncodeError while merely reporting success is a silly way to lose."""
    encoding = sys.stdout.encoding or "utf-8"
    print(text.encode(encoding, "replace").decode(encoding))


def fetch(url: str) -> list[str]:
    request = urllib.request.Request(url, headers={"User-Agent": "Happ/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        body = response.read().decode("utf-8", "replace").strip()

    if "://" not in body:
        # Subscriptions are conventionally base64; padding is often stripped.
        body = base64.b64decode(body + "=" * (-len(body) % 4)).decode("utf-8", "replace")
    return [line.strip() for line in body.splitlines() if line.strip().startswith("vless://")]


def parse_vless(uri: str) -> dict | None:
    """Only VLESS over TCP with REALITY is handled — that is what this
    subscription serves, and guessing at other transports would produce configs
    that fail at runtime rather than here."""
    parts = urllib.parse.urlsplit(uri)
    query = {k: v[0] for k, v in urllib.parse.parse_qs(parts.query).items()}

    if query.get("security") != "reality" or query.get("type", "tcp") != "tcp":
        return None
    if not (parts.username and parts.hostname and parts.port):
        return None

    return {
        "address": parts.hostname,
        "port": parts.port,
        "uuid": parts.username,
        "flow": query.get("flow", ""),
        "sni": query.get("sni", ""),
        "fingerprint": query.get("fp", "chrome"),
        "public_key": query.get("pbk", ""),
        "short_id": query.get("sid", ""),
        "spider_x": query.get("spx", "/"),
        "label": urllib.parse.unquote(parts.fragment) or parts.hostname,
    }


def outbound(server: dict, tag: str) -> dict:
    return {
        "tag": tag,
        "protocol": "vless",
        "settings": {
            "vnext": [{
                "address": server["address"],
                "port": server["port"],
                "users": [{
                    "id": server["uuid"],
                    "encryption": "none",
                    "flow": server["flow"],
                }],
            }]
        },
        "streamSettings": {
            "network": "tcp",
            "security": "reality",
            "realitySettings": {
                "serverName": server["sni"],
                "fingerprint": server["fingerprint"],
                "publicKey": server["public_key"],
                "shortId": server["short_id"],
                "spiderX": server["spider_x"],
            },
            # The VM advertises an IPv6 route that drops packets — the same
            # fault the backend's Telegram client documents and works around by
            # forcing IPv4 in Python. Xray has no such patch applied to it, so
            # without this it resolves the subscription's hostnames to AAAA
            # records and every handshake dies on a route to nowhere.
            "sockopt": {"domainStrategy": "ForceIPv4"},
        },
    }


def build_config(servers: list[dict], http_port: int, socks_port: int) -> dict:
    tags = [f"vpn{i}" for i in range(len(servers))]
    return {
        # info, not warning: the observatory reports which servers are alive at
        # this level, and that is the one thing worth being able to see when
        # nothing works. Nothing here is per-request, so it stays quiet.
        "log": {"loglevel": "info"},
        # Belt and braces with sockopt.domainStrategy above: resolve nothing to
        # AAAA, because this host's IPv6 route silently discards packets.
        "dns": {"servers": ["1.1.1.1", "8.8.8.8"], "queryStrategy": "UseIPv4"},
        "inbounds": [
            {
                # 0.0.0.0 is safe here: the container is only on the internal
                # docker network, never published to a host port.
                "tag": "http-in",
                "listen": "0.0.0.0",
                "port": http_port,
                "protocol": "http",
                "sniffing": {"enabled": False},
            },
            {
                "tag": "socks-in",
                "listen": "0.0.0.0",
                "port": socks_port,
                "protocol": "socks",
                "settings": {"udp": True, "auth": "noauth"},
                "sniffing": {"enabled": False},
            },
        ],
        "outbounds": [outbound(s, t) for s, t in zip(servers, tags)]
        + [{
            "tag": "direct",
            "protocol": "freedom",
            "settings": {"domainStrategy": "UseIPv4"},
        }],
        # Health-checks every server and keeps the balancer pointed at ones that
        # actually respond, so a dead node costs one probe rather than every
        # request until someone notices.
        "observatory": {
            "subjectSelector": ["vpn"],
            "probeUrl": PROBE_URL,
            "probeInterval": "60s",
            "enableConcurrency": True,
        },
        "routing": {
            "domainStrategy": "AsIs",
            "balancers": [{
                "tag": "balancer",
                "selector": ["vpn"],
                "strategy": {"type": "leastPing"},
            }],
            "rules": [{
                "type": "field",
                "inboundTag": ["http-in", "socks-in"],
                "balancerTag": "balancer",
            }],
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=os.getenv("SUBSCRIPTION_URL", ""),
                        help="subscription link (default: $SUBSCRIPTION_URL)")
    parser.add_argument("--out", default="vpn-proxy/config.json")
    parser.add_argument("--servers", type=int, default=DEFAULT_SERVERS,
                        help=f"how many servers to put behind the balancer (default {DEFAULT_SERVERS})")
    parser.add_argument("--http-port", type=int, default=8889)
    parser.add_argument("--socks-port", type=int, default=1080)
    args = parser.parse_args()

    if not args.url:
        print("ERROR: pass --url or set SUBSCRIPTION_URL", file=sys.stderr)
        return 2

    try:
        uris = fetch(args.url)
    except Exception as exc:  # noqa: BLE001 — the message is the whole point
        print(f"ERROR: could not fetch the subscription: {exc}", file=sys.stderr)
        return 1

    servers = [s for s in (parse_vless(u) for u in uris) if s]
    if not servers:
        print(f"ERROR: no usable VLESS/REALITY servers among {len(uris)} entries", file=sys.stderr)
        return 1

    chosen = servers[: args.servers]
    config = build_config(chosen, args.http_port, args.socks_port)

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(config, fh, indent=2)
        fh.write("\n")

    print(f"{len(servers)} servers in the subscription, using {len(chosen)}:")
    for server in chosen:
        _print(f"  {server['label']}  ({server['address']}:{server['port']})")
    print(f"\nWrote {args.out} — HTTP proxy on :{args.http_port}, SOCKS on :{args.socks_port}")
    print("This file contains subscription credentials. It is gitignored; keep it that way.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
