import argparse
import json
from pathlib import Path

from rag_common import bootstrap_env, embed_texts, load_chunks


def batched(items: list[dict], size: int) -> list[list[dict]]:
    return [items[index : index + size] for index in range(0, len(items), size)]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a file-based vector store from processed chunks."
    )
    parser.add_argument(
        "--chunks",
        type=Path,
        default=None,
        help="Path to processed chunks.jsonl.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Path to output vector store jsonl.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=16,
        help="Embedding batch size.",
    )
    return parser.parse_args()


def main() -> None:
    bootstrap_env()
    args = parse_args()
    chunks = load_chunks(args.chunks)

    output_path = args.output or Path("data/vectors/ecommerce-kb-zh.jsonl")
    output_path = output_path.resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with output_path.open("w", encoding="utf-8") as handle:
        for batch in batched(chunks, args.batch_size):
            embeddings = embed_texts([row["text"] for row in batch])
            for row, embedding in zip(batch, embeddings):
                payload = {
                    "chunk_id": row["chunk_id"],
                    "chunk_type": row["chunk_type"],
                    "category": row["category"],
                    "title": row["title"],
                    "text": row["text"],
                    "keywords": row["keywords"],
                    "source_ids": row["source_ids"],
                    "source_titles": row["source_titles"],
                    "display_source": row["display_source"],
                    "embedding": embedding,
                }
                handle.write(json.dumps(payload, ensure_ascii=False) + "\n")
            print(f"Embedded {len(batch)} chunks")

    print(f"Done. Vector store written to {output_path}")


if __name__ == "__main__":
    main()
