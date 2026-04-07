import argparse
from pathlib import Path

import chromadb

from rag_common import bootstrap_env, embed_texts, get_chroma_settings, load_chunks


def batched(items: list[dict], size: int) -> list[list[dict]]:
    return [items[index : index + size] for index in range(0, len(items), size)]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Ingest processed KB chunks into Chroma.")
    parser.add_argument(
        "--chunks",
        type=Path,
        default=None,
        help="Path to processed chunks.jsonl. Defaults to data-processed/ecommerce-kb-zh/chunks.jsonl",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=16,
        help="Embedding batch size.",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Delete and recreate the target collection before ingesting.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    bootstrap_env()

    chroma_path, collection_name = get_chroma_settings()
    chroma_path.mkdir(parents=True, exist_ok=True)

    client = chromadb.PersistentClient(path=str(chroma_path))

    if args.reset:
        try:
            client.delete_collection(collection_name)
        except Exception:
            pass

    collection = client.get_or_create_collection(name=collection_name)
    chunks = load_chunks(args.chunks)

    for batch in batched(chunks, args.batch_size):
        documents = [row["text"] for row in batch]
        embeddings = embed_texts(documents)
        ids = [row["chunk_id"] for row in batch]
        metadatas = [
            {
                "chunk_type": row["chunk_type"],
                "category": row["category"],
                "title": row["title"],
                "display_source": row["display_source"],
                "source_ids": "|".join(row["source_ids"]),
                "source_titles": "|".join(row["source_titles"]),
                "keywords": "|".join(row["keywords"]),
            }
            for row in batch
        ]
        collection.upsert(
            ids=ids,
            documents=documents,
            embeddings=embeddings,
            metadatas=metadatas,
        )
        print(f"Ingested {len(batch)} chunks")

    print(f"Done. Collection '{collection_name}' is ready at {chroma_path}")


if __name__ == "__main__":
    main()
