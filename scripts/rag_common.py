import json
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CHUNKS_PATH = ROOT / "data-processed" / "ecommerce-kb-zh" / "chunks.jsonl"


def bootstrap_env() -> None:
    load_dotenv(ROOT / ".env")


def require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def get_chroma_settings() -> tuple[Path, str]:
    chroma_path = os.getenv("CHROMA_PATH", "./data/chroma").strip()
    collection = os.getenv("CHROMA_COLLECTION", "ecommerce-kb-zh").strip()
    return (ROOT / chroma_path).resolve(), collection


def get_embedding_client() -> tuple[Any, str]:
    from openai import OpenAI

    api_key = require_env("OPENAI_API_KEY")
    base_url = os.getenv("OPENAI_BASE_URL", "").strip() or None
    model = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small").strip()
    client = OpenAI(api_key=api_key, base_url=base_url)
    return client, model


def embed_texts(texts: list[str]) -> list[list[float]]:
    client, model = get_embedding_client()
    response = client.embeddings.create(model=model, input=texts)
    return [item.embedding for item in response.data]


def load_chunks(path: Path | None = None) -> list[dict[str, Any]]:
    source_path = path or DEFAULT_CHUNKS_PATH
    rows: list[dict[str, Any]] = []
    for line in source_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        rows.append(json.loads(line))
    return rows
