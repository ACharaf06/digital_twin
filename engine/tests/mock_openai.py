"""A local stand-in for the OpenAI API, so no test ever calls the real one.

It speaks just enough of the API for the engine: model lookup (the health
check), embeddings (including the base64 encoding the SDK asks for), structured
chat calls (dispatched on the JSON-schema name) and streamed chat completions.
Every request is recorded, so a test can assert on exactly what was sent.

A few latest-user-message values trigger failure modes:
    "unavailable"   every chat call answers 503
    "rate limited"  every chat call answers 429
    "wait"          the streamed answer never ends until the client disconnects
and one substring fails only the streamed answer, after routing and grading:
    "fail while answering"
"""
from __future__ import annotations

import base64
import json
import random
import re
import struct
import threading
import time
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Callable, Optional

from rag.retriever import searchable


def latest_user(messages: list) -> str:
    for message in reversed(messages):
        if message.get("role") == "user":
            content = message.get("content")
            if isinstance(content, list):
                return "".join(part.get("text", "") for part in content)
            return content or ""
    return ""


def previous_user(messages: list) -> str:
    users = [m for m in messages if m.get("role") == "user"]
    return users[-2]["content"] if len(users) > 1 else ""


def far_from_everything(text: str, dims: int) -> list[float]:
    """A fixed pseudo-random unit vector per text: near-orthogonal to every
    passage, so dense retrieval stays below its floor and results are keyword-only."""
    rng = random.Random(zlib.crc32(text.encode()))
    values = [rng.gauss(0, 1) for _ in range(dims)]
    norm = sum(v * v for v in values) ** 0.5
    return [v / norm for v in values]


def default_route(messages: list) -> dict:
    latest = latest_user(messages)
    kind = "small_talk" if latest == "wait" or not searchable(latest) else "documents"
    previous = previous_user(messages)
    # stands in for the model resolving a follow-up against the conversation
    standalone = f"{previous} {latest}" if len(latest) < 25 and previous else latest
    return {"kind": kind, "standalone": standalone, "french": standalone}


def default_grade(messages: list) -> dict:
    numbers = re.findall(r"^### Passage (\d+)", latest_user(messages), re.M)
    return {"relevant": [int(n) for n in numbers]}


class _Server(ThreadingHTTPServer):
    daemon_threads = True
    mock: "MockOpenAI"


class _Handler(BaseHTTPRequestHandler):
    server: _Server

    def log_message(self, *args) -> None:  # keep test output clean
        pass

    def _record(self, body) -> None:
        self.server.mock.requests.append(
            {
                "method": self.command,
                "path": self.path,
                "auth": self.headers.get("Authorization"),
                "body": body,
            }
        )

    def _json(self, data: dict, status: int = 200, headers: Optional[dict] = None) -> None:
        payload = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(payload)

    def _completion(self, body: dict, content: str) -> None:
        self._json(
            {
                "id": "mock",
                "object": "chat.completion",
                "created": 0,
                "model": body.get("model"),
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": content},
                        "finish_reason": "stop",
                    }
                ],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
            }
        )

    def do_GET(self) -> None:
        self._record(None)
        if self.path.startswith("/v1/models/"):
            model = self.path.rsplit("/", 1)[-1]
            return self._json({"id": model, "object": "model", "created": 0, "owned_by": "mock"})
        self._json({"error": {"message": "not found"}}, 404)

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(length) or b"{}")
        self._record(body)
        mock = self.server.mock

        if self.path.endswith("/embeddings"):
            texts = body["input"] if isinstance(body["input"], list) else [body["input"]]
            dims = body.get("dimensions") or mock.dims
            data = []
            for position, text in enumerate(texts):
                vector = [float(v) for v in mock.embed(text, dims)]
                if body.get("encoding_format") == "base64":
                    packed = struct.pack(f"<{len(vector)}f", *vector)
                    embedding = base64.b64encode(packed).decode()
                else:
                    embedding = vector
                data.append({"object": "embedding", "index": position, "embedding": embedding})
            return self._json(
                {
                    "object": "list",
                    "data": data,
                    "model": body.get("model"),
                    "usage": {"prompt_tokens": 1, "total_tokens": 1},
                }
            )

        if not self.path.endswith("/chat/completions"):
            return self._json({"error": {"message": "not found"}}, 404)
        messages = body.get("messages", [])
        latest = latest_user(messages)
        if latest == "unavailable":
            return self._json({"error": {"message": "unavailable", "type": "server_error"}}, 503)
        if latest == "rate limited":
            return self._json(
                {"error": {"message": "slow down", "type": "requests", "code": "rate_limit_exceeded"}},
                429,
                {"retry-after": "0"},
            )
        schema = (body.get("response_format") or {}).get("json_schema")
        if schema:
            name = schema.get("name") or schema.get("schema", {}).get("title")
            return self._completion(body, json.dumps(mock.structured[name](messages)))
        if body.get("stream"):
            if "fail while answering" in latest:
                return self._json({"error": {"message": "unavailable", "type": "server_error"}}, 503)
            return self._stream(body, messages, latest)
        self._completion(body, "".join(mock.reply(messages)))

    def _stream(self, body: dict, messages: list, latest: str) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()

        def send(delta: dict, finish: Optional[str] = None) -> None:
            chunk = {
                "id": "mock",
                "object": "chat.completion.chunk",
                "created": 0,
                "model": body.get("model"),
                "choices": [{"index": 0, "delta": delta, "finish_reason": finish}],
            }
            self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode())
            self.wfile.flush()

        try:
            if latest == "wait":
                send({"role": "assistant", "content": "Still thinking"})
                for _ in range(400):  # ~20s ceiling, so a failed test cannot hang forever
                    time.sleep(0.05)
                    send({"content": "."})
                return
            for piece in self.server.mock.reply(messages):
                send({"content": piece})
            send({}, "stop")
            self.wfile.write(b"data: [DONE]\n\n")
        except (BrokenPipeError, ConnectionResetError):
            self.server.mock.aborted.set()


class MockOpenAI:
    def __init__(
        self,
        *,
        embed: Optional[Callable[[str, int], list]] = None,
        structured: Optional[dict] = None,
        reply: Optional[Callable[[list], list]] = None,
        dims: int = 1024,
    ) -> None:
        self.requests: list[dict] = []
        self.aborted = threading.Event()
        self.dims = dims
        self.embed = embed or far_from_everything
        self.structured = {"RouteDecision": default_route, "Grade": default_grade, **(structured or {})}
        self.reply = reply or (lambda messages: ["Bonjour, café ✨", "!"])

    def start(self) -> "MockOpenAI":
        self._server = _Server(("127.0.0.1", 0), _Handler)
        self._server.mock = self
        threading.Thread(target=self._server.serve_forever, daemon=True).start()
        return self

    def stop(self) -> None:
        self._server.shutdown()
        self._server.server_close()

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self._server.server_address[1]}/v1"

    def chat_bodies(self) -> list[dict]:
        return [r["body"] for r in self.requests if r["path"].endswith("/chat/completions")]

    def answer_request(self) -> dict:
        """The last streamed chat call: the one that writes the visible answer."""
        return [body for body in self.chat_bodies() if body.get("stream")][-1]
