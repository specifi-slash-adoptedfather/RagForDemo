import argparse
import json
import math
import os
from pathlib import Path

from rag_common import bootstrap_env, embed_texts


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Search a file-based vector store.")
    parser.add_argument("query", type=str, help="User query to search.")
    parser.add_argument("--top-k", type=int, default=4, help="Number of results to return.")
    parser.add_argument(
        "--store",
        type=Path,
        default=None,
        help="Path to vector store jsonl.",
    )
    return parser.parse_args()


def cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def load_store(path: Path) -> list[dict]:
    rows: list[dict] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        rows.append(json.loads(line))
    return rows


def main() -> None:
    bootstrap_env()
    args = parse_args()
    store_path = args.store or Path(
        os.getenv("VECTOR_STORE_PATH", "./data/vectors/ecommerce-kb-zh.jsonl")
    )
    store_path = store_path.resolve()
    rows = load_store(store_path)

    query_embedding = embed_texts([args.query])[0]
    scored = [
        (cosine_similarity(query_embedding, row["embedding"]), row) for row in rows
    ]
    scored.sort(key=lambda item: item[0], reverse=True)

    for index, (score, row) in enumerate(scored[: args.top_k], start=1):
        print(f"[{index}] {row['title']}")
        print(f"category: {row['category']}")
        print(f"source: {row['display_source']}")
        print(f"score: {score:.4f}")
        print(row["text"])
        print("-" * 80)


if __name__ == "__main__":
    main()
