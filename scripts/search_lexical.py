import argparse
import json
import math
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
CHUNKS_PATH = ROOT / "data-processed" / "ecommerce-kb-zh" / "chunks.jsonl"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Search processed chunks with a lexical scorer.")
    parser.add_argument("query", type=str, help="User query.")
    parser.add_argument("--top-k", type=int, default=4, help="Number of results to return.")
    return parser.parse_args()


def load_chunks() -> list[dict]:
    rows: list[dict] = []
    for line in CHUNKS_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        rows.append(json.loads(line))
    return rows


def extract_terms(text: str) -> list[str]:
    clean = re.sub(r"\s+", "", text)
    ascii_terms = [token.lower() for token in re.findall(r"[A-Za-z0-9]+", text)]
    chinese_chars = re.findall(r"[\u4e00-\u9fff]", clean)
    bigrams = [
        "".join(chinese_chars[index : index + 2])
        for index in range(len(chinese_chars) - 1)
    ]
    return ascii_terms + bigrams + chinese_chars


def build_doc_terms(chunk: dict) -> list[str]:
    parts = [
        chunk["title"],
        chunk["text"],
        " ".join(chunk["keywords"]),
        chunk["category"],
    ]
    return extract_terms(" ".join(parts))


def score(query_terms: list[str], doc_terms: list[str]) -> float:
    query_counter = Counter(query_terms)
    doc_counter = Counter(doc_terms)

    overlap = 0.0
    for term, q_count in query_counter.items():
        if term in doc_counter:
            overlap += min(q_count, doc_counter[term]) * 2.0

    title_bonus = 0.0
    for term in query_counter:
        if len(term) >= 2 and term in "".join(doc_terms[:50]):
            title_bonus += 0.2

    norm = math.sqrt(len(query_terms) + 1) * math.sqrt(len(doc_terms) + 1)
    return (overlap + title_bonus) / norm


def main() -> None:
    args = parse_args()
    chunks = load_chunks()
    query_terms = extract_terms(args.query)

    scored = []
    for chunk in chunks:
        doc_terms = build_doc_terms(chunk)
        chunk_score = score(query_terms, doc_terms)
        scored.append((chunk_score, chunk))

    scored.sort(key=lambda item: item[0], reverse=True)

    for index, (chunk_score, chunk) in enumerate(scored[: args.top_k], start=1):
        print(f"[{index}] {chunk['title']}")
        print(f"category: {chunk['category']}")
        print(f"source: {chunk['display_source']}")
        print(f"score: {chunk_score:.4f}")
        print(chunk["text"])
        print("-" * 80)


if __name__ == "__main__":
    main()
