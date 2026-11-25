"""Relais Internet : met en relation un PC (hote) et un telephone via une 'salle'.

A heberger sur un VPS (derriere HTTPS/WSS : Caddy, nginx, Cloudflare...).
Le relais ne fait que transmettre les messages ; la cle d'appairage est
verifiee, mais utilisez toujours TLS en production.
"""
from __future__ import annotations

import argparse
import logging
import re
import secrets
from pathlib import Path

from aiohttp import WSMsgType, web

WEB_DIR = Path(__file__).parent / "web"
ROOM_RE = re.compile(r"^[A-Za-z0-9_-]{3,40}$")
log = logging.getLogger("pocketpad.relay")


def make_app() -> web.Application:
    app = web.Application()
    app["rooms"] = {}  # room -> {"key", "host", "clients"}

    async def index(_):
        return web.FileResponse(WEB_DIR / "index.html")

    async def host(request: web.Request):
        room = request.match_info["room"]
        if not ROOM_RE.match(room):
            raise web.HTTPBadRequest(text="nom de salle invalide")
        key = request.query.get("key", "")
        if not key:
            raise web.HTTPForbidden(text="cle manquante")
        existing = app["rooms"].get(room)
        if existing and existing["host"] is not None and not existing["host"].closed:
            raise web.HTTPConflict(text="salle deja occupee")
        ws = web.WebSocketResponse(heartbeat=15, max_msg_size=4096)
        await ws.prepare(request)
        state = {"key": key, "host": ws, "clients": existing["clients"] if existing else set()}
        app["rooms"][room] = state
        log.info("hote connecte: %s", room)
        try:
            async for msg in ws:
                if msg.type == WSMsgType.TEXT:
                    for c in list(state["clients"]):
                        await c.send_str(msg.data)
        finally:
            state["host"] = None
            if not state["clients"]:
                app["rooms"].pop(room, None)
        return ws

    async def client(request: web.Request):
        room = request.match_info["room"]
        state = app["rooms"].get(room)
        if not state or not secrets.compare_digest(request.query.get("key", ""), state["key"]):
            raise web.HTTPForbidden(text="salle ou cle invalide")
        ws = web.WebSocketResponse(heartbeat=15, max_msg_size=4096)
        await ws.prepare(request)
        state["clients"].add(ws)
        try:
            async for msg in ws:
                h = state["host"]
                if msg.type == WSMsgType.TEXT and h is not None and not h.closed:
                    await h.send_str(msg.data)
        finally:
            state["clients"].discard(ws)
        return ws

    app.router.add_get("/", index)
    app.router.add_get("/host/{room}", host)
    app.router.add_get("/ws/{room}", client)
    app.router.add_static("/static", WEB_DIR)
    return app


def main() -> None:
    p = argparse.ArgumentParser(prog="pocketpad-relay")
    p.add_argument("--host", default="0.0.0.0")
    p.add_argument("--port", type=int, default=9000)
    args = p.parse_args()
    logging.basicConfig(level=logging.INFO)
    web.run_app(make_app(), host=args.host, port=args.port, print=None)


if __name__ == "__main__":
    main()
