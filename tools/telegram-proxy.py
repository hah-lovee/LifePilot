"""HTTP CONNECT proxy: lets the VM reach Telegram through this PC.

Why this exists
---------------
The Hyper-V VM's traffic leaves through the ISP directly and Telegram is
filtered there — measured repeatedly: TCP connects to api.telegram.org succeed
instantly, then the actual HTTPS request hangs until it times out, which looks
like DPI killing the session after the handshake. From this PC, whose traffic
goes through a VPN, the same addresses answer in 0.01s. So the fix is not
better retry logic in the bot; it's sending the bot's Telegram traffic through
the machine where it works.

Runs as a plain Windows process (not in Docker) on purpose: a native process
uses the host's routing table and therefore the VPN, whereas a container's
egress depends on Docker Desktop's network configuration.

Deliberately not a general-purpose proxy
----------------------------------------
It would be trivially abusable as an open relay, sitting as it does on a
machine with a working VPN. So: CONNECT only, one allowlisted hostname, port
443 only, and only from private address ranges. Everything else gets a 403 and
a log line.

Usage
-----
    python tools/telegram-proxy.py

Environment (all optional):
    PROXY_HOST     bind address            (default 0.0.0.0)
    PROXY_PORT     bind port               (default 8889)
    PROXY_ALLOWED_HOSTS   comma-separated  (default api.telegram.org,core.telegram.org)
    PROXY_ALLOWED_CIDRS   comma-separated  (default private ranges)
"""
import ipaddress
import logging
import os
import selectors
import socket
import socketserver
import sys
import threading

HOST = os.getenv("PROXY_HOST", "0.0.0.0")
PORT = int(os.getenv("PROXY_PORT", "8889"))
ALLOWED_HOSTS = {
    h.strip().lower()
    for h in os.getenv("PROXY_ALLOWED_HOSTS", "api.telegram.org,core.telegram.org").split(",")
    if h.strip()
}
# The Hyper-V Default Switch renumbers its subnet on every host reboot, so
# pinning the VM's exact address would break the same way HOST_GW did. Private
# ranges are narrow enough given the PC sits behind a router.
ALLOWED_CIDRS = [
    ipaddress.ip_network(c.strip())
    for c in os.getenv(
        "PROXY_ALLOWED_CIDRS", "127.0.0.0/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"
    ).split(",")
    if c.strip()
]
ALLOWED_PORTS = {443}

CONNECT_TIMEOUT = 15
IDLE_TIMEOUT = 300
BUFFER = 65536

logging.basicConfig(
    level=os.getenv("PROXY_LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)-7s %(message)s",
)
logger = logging.getLogger("telegram-proxy")


def _client_allowed(ip: str) -> bool:
    try:
        address = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(address in network for network in ALLOWED_CIDRS)


def _pump(a: socket.socket, b: socket.socket) -> None:
    """Shuttle bytes both ways until either side closes or goes quiet.

    select-based rather than a thread per direction: half the threads, and the
    idle timeout applies to the tunnel as a whole, which is what long-polling
    getUpdates connections actually need.
    """
    selector = selectors.DefaultSelector()
    selector.register(a, selectors.EVENT_READ, b)
    selector.register(b, selectors.EVENT_READ, a)
    try:
        while True:
            events = selector.select(timeout=IDLE_TIMEOUT)
            if not events:
                return  # idle too long
            for key, _ in events:
                source: socket.socket = key.fileobj  # type: ignore[assignment]
                target: socket.socket = key.data
                try:
                    chunk = source.recv(BUFFER)
                except OSError:
                    return
                if not chunk:
                    return
                try:
                    target.sendall(chunk)
                except OSError:
                    return
    finally:
        selector.close()


class ConnectHandler(socketserver.BaseRequestHandler):
    def handle(self) -> None:
        client_ip = self.client_address[0]
        if not _client_allowed(client_ip):
            logger.warning("Refused %s: not in an allowed range", client_ip)
            self._deny(403, "Forbidden")
            return

        try:
            request_line = self._read_request_line()
        except (OSError, ValueError) as exc:
            logger.warning("Refused %s: bad request (%s)", client_ip, exc)
            return

        parts = request_line.split()
        if len(parts) < 2 or parts[0].upper() != "CONNECT":
            logger.warning("Refused %s: not a CONNECT (%r)", client_ip, request_line[:80])
            self._deny(405, "Method Not Allowed")
            return

        host, _, port_text = parts[1].rpartition(":")
        try:
            port = int(port_text)
        except ValueError:
            self._deny(400, "Bad Request")
            return

        if host.lower() not in ALLOWED_HOSTS or port not in ALLOWED_PORTS:
            logger.warning("Refused %s: target %s:%s not allowlisted", client_ip, host, port)
            self._deny(403, "Forbidden")
            return

        try:
            upstream = socket.create_connection((host, port), CONNECT_TIMEOUT)
        except OSError as exc:
            logger.error("Upstream %s:%s failed for %s: %s", host, port, client_ip, exc)
            self._deny(502, "Bad Gateway")
            return

        logger.info("Tunnel open %s -> %s:%s", client_ip, host, port)
        try:
            self.request.sendall(b"HTTP/1.1 200 Connection established\r\n\r\n")
            self.request.settimeout(None)
            upstream.settimeout(None)
            _pump(self.request, upstream)
        finally:
            upstream.close()
            logger.info("Tunnel closed %s -> %s:%s", client_ip, host, port)

    def _read_request_line(self) -> str:
        """Read just the request line plus headers, no more: the bytes after
        the blank line are already tunnel payload and must not be consumed."""
        self.request.settimeout(CONNECT_TIMEOUT)
        buffer = b""
        while b"\r\n\r\n" not in buffer:
            chunk = self.request.recv(BUFFER)
            if not chunk:
                raise ValueError("client closed before sending a request")
            buffer += chunk
            if len(buffer) > 16384:
                raise ValueError("request headers too large")
        return buffer.split(b"\r\n", 1)[0].decode("latin-1")

    def _deny(self, code: int, reason: str) -> None:
        try:
            self.request.sendall(f"HTTP/1.1 {code} {reason}\r\nConnection: close\r\n\r\n".encode())
        except OSError:
            pass


class ThreadedProxy(socketserver.ThreadingTCPServer):
    # Not on Windows: there SO_REUSEADDR lets a second process bind the *same*
    # live port, and connections then go to whichever instance the OS feels
    # like — so a forgotten older copy silently serves traffic with its old
    # configuration. (Cost an entirely confusing debugging round.) Leaving it
    # off makes a duplicate launch fail loudly instead. On POSIX it only means
    # "reuse a TIME_WAIT port", which is the harmless, wanted behaviour.
    allow_reuse_address = os.name != "nt"
    daemon_threads = True


def main() -> int:
    logger.info(
        "Listening on %s:%d | hosts=%s | clients=%s",
        HOST, PORT, ",".join(sorted(ALLOWED_HOSTS)), ",".join(str(c) for c in ALLOWED_CIDRS),
    )
    try:
        with ThreadedProxy((HOST, PORT), ConnectHandler) as server:
            server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Stopped")
    except OSError as exc:
        logger.error("Cannot bind %s:%d — %s", HOST, PORT, exc)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
