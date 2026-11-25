"""Serveur PocketPad : sert la manette web et applique les entrees sur le PC."""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import secrets
import shutil
import socket
import subprocess
from pathlib import Path
from typing import Optional

from aiohttp import ClientSession, WSMsgType, web

from .backends import Backend, create_backend
from .state import NEUTRAL, parse_state

log = logging.getLogger("pocketpad")
WEB_DIR = Path(__file__).parent / "web"


def local_ips() -> list:
    """Adresses IPv4 locales (Wi-Fi, Ethernet, USB tethering, Bluetooth PAN...)."""
    ips = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    return sorted(ip for ip in ips if not ip.startswith("127."))


def make_app(backend: Backend, key: str) -> web.Application:
    app = web.Application()
    app["backend"] = backend
    app["key"] = key
    app["clients"] = set()

    async def index(_: web.Request) -> web.StreamResponse:
        return web.FileResponse(WEB_DIR / "index.html")

    async def ws_handler(request: web.Request) -> web.StreamResponse:
        if not secrets.compare_digest(request.query.get("key", ""), key):
            raise web.HTTPForbidden(text="cle invalide")
        ws = web.WebSocketResponse(heartbeat=15, max_msg_size=4096)
        await ws.prepare(request)
        _nodelay(request)
        app["clients"].add(ws)
        log.info("Manette connectee (%s)", request.remote)
        try:
            async for msg in ws:
                if msg.type == WSMsgType.TEXT:
                    handle_message(app, ws, msg.data)
        finally:
            app["clients"].discard(ws)
            backend.apply(NEUTRAL)  # jamais de bouton bloque a la deconnexion
            log.info("Manette deconnectee")
        return ws

    app.router.add_get("/", index)
    app.router.add_get("/ws", ws_handler)
    app.router.add_static("/static", WEB_DIR)
    return app


def _nodelay(request: web.Request) -> None:
    sock = request.transport.get_extra_info("socket") if request.transport else None
    if sock is not None:
        try:
            sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        except OSError:
            pass


def handle_message(app: web.Application, ws: Optional[web.WebSocketResponse], raw: str):
    """Traite un message JSON. Retourne la reponse eventuelle (pong)."""
    try:
        msg = json.loads(raw)
        kind = msg.get("t")
    except (ValueError, AttributeError):
        return None
    if kind == "s":
        app["backend"].apply(parse_state(msg))
    elif kind == "ping":
        reply = {"t": "pong", "ts": msg.get("ts")}
        if ws is not None:
            asyncio.ensure_future(ws.send_json(reply))
        return reply
    return None


def broadcast_rumble(app: web.Application, loop: asyncio.AbstractEventLoop):
    def cb(large: float, small: float) -> None:
        payload = {"t": "rumble", "l": round(large, 2), "s": round(small, 2)}
        for c in list(app["clients"]):
            loop.call_soon_threadsafe(asyncio.ensure_future, c.send_json(payload))
    app["backend"].on_rumble = cb


async def relay_agent(app: web.Application, url: str, room: str, key: str) -> None:
    """Mode Internet : se connecte (en sortie) a un relais, aucun port a ouvrir."""
    target = f"{url.rstrip('/')}/host/{room}"
    while True:
        try:
            async with ClientSession() as session:
                async with session.ws_connect(target, params={"key": key}, heartbeat=15) as ws:
                    log.info("Relais Internet connecte (salle %s)", room)
                    app["clients"].add(ws)
                    async for msg in ws:
                        if msg.type == WSMsgType.TEXT:
                            handle_message(app, ws, msg.data)
        except Exception as exc:  # noqa: BLE001
            log.warning("Relais indisponible (%s), nouvel essai dans 3 s", exc)
        app["backend"].apply(NEUTRAL)
        await asyncio.sleep(3)


def setup_usb(port: int) -> bool:
    adb = shutil.which("adb")
    if not adb:
        log.warning("adb introuvable : installez les Android platform-tools pour le mode USB")
        return False
    r = subprocess.run([adb, "reverse", f"tcp:{port}", f"tcp:{port}"], capture_output=True, text=True)
    if r.returncode != 0:
        log.warning("adb reverse a echoue : %s", r.stderr.strip() or r.stdout.strip())
        return False
    return True


def print_links(port: int, key: str, usb: bool, qr: bool) -> None:
    print("\n=== PocketPad pret ===")
    links = []
    if usb:
        links.append(("USB (cable)", f"http://localhost:{port}/?key={key}"))
    for ip in local_ips():
        links.append((f"Reseau {ip} (Wi-Fi / Ethernet / Bluetooth PAN / USB tethering)",
                      f"http://{ip}:{port}/?key={key}"))
    for label, link in links:
        print(f"- {label}\n    {link}")
    if qr and links:
        try:
            import qrcode  # type: ignore
            code = qrcode.QRCode(border=1)
            code.add_data(links[-1][1] if not usb else links[0][1])
            code.print_ascii(invert=True)
        except ImportError:
            pass
    print()


def main(argv: Optional[list] = None) -> None:
    p = argparse.ArgumentParser(prog="pocketpad", description=__doc__)
    p.add_argument("--host", default="0.0.0.0")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--backend", default="auto", choices=["auto", "vigem", "evdev", "keyboard", "null"])
    p.add_argument("--key", default=None, help="cle d'appairage (aleatoire par defaut)")
    p.add_argument("--usb", action="store_true", help="active le mode cable USB (adb reverse)")
    p.add_argument("--relay", default=None, help="URL du relais Internet, ex: wss://relais.exemple.com")
    p.add_argument("--room", default=None, help="nom de salle pour le relais")
    p.add_argument("--no-qr", action="store_true")
    p.add_argument("-v", "--verbose", action="store_true")
    args = p.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")

    key = args.key or secrets.token_urlsafe(9)
    backend = create_backend(args.backend)
    app = make_app(backend, key)
    usb_ok = setup_usb(args.port) if args.usb else False

    async def on_startup(a: web.Application) -> None:
        broadcast_rumble(a, asyncio.get_running_loop())
        if args.relay:
            room = args.room or secrets.token_urlsafe(4)
            a["relay_task"] = asyncio.create_task(relay_agent(a, args.relay, room, key))
            base = args.relay.replace("wss://", "https://").replace("ws://", "http://").rstrip("/")
            print(f"\nInternet : ouvrez sur le telephone\n    {base}/?room={room}&key={key}\n")

    app.on_startup.append(on_startup)
    print_links(args.port, key, usb_ok, not args.no_qr)
    try:
        web.run_app(app, host=args.host, port=args.port, print=None)
    finally:
        backend.close()
