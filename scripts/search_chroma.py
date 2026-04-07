import argparse

import chromadb

from rag_common import bootstrap_env, embed_texts, get_chroma_settings


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Search the Chroma collection with a query.")
    parser.add_argument("query", type=str, help="User query to search.")
    parser.add_argument("--top-k", type=int, default=4, help="Number of results to return.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    bootstrap_env()

    chroma_path, collection_name = get_chroma_settings()
    client = chromadb.PersistentClient(path=str(chroma_path))
    collection = client.get_collection(collection_name)

    query_embedding = embed_texts([args.query])[0]
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=args.top_k,
        include=["documents", "metadatas", "distances"],
    )

    documents = results["documents"][0]
    metadatas = results["metadatas"][0]
    distances = results["distances"][0]

    for index, (document, metadata, distance) in enumerate(
        zip(documents, metadatas, distances), start=1
    ):
        print(f"[{index}] {metadata['title']}")
        print(f"category: {metadata['category']}")
        print(f"source: {metadata['display_source']}")
        print(f"distance: {distance}")
        print(document)
        print("-" * 80)


if __name__ == "__main__":
    main()
