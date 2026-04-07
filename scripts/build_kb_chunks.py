import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
INPUT_DIR = ROOT / "data-seeds" / "ecommerce-kb-zh"
OUTPUT_DIR = ROOT / "data-processed" / "ecommerce-kb-zh"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        rows.append(json.loads(line))
    return rows


def normalize_whitespace(text: str) -> str:
    text = text.replace("\r\n", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def parse_policy_sections(markdown_text: str) -> list[dict[str, Any]]:
    sections: list[dict[str, Any]] = []
    current_title: str | None = None
    current_lines: list[str] = []
    current_sources: list[str] = []

    for raw_line in markdown_text.splitlines():
        line = raw_line.rstrip()

        if line.startswith("## "):
            if current_title and current_lines:
                sections.append(
                    {
                        "title": current_title,
                        "body": normalize_whitespace("\n".join(current_lines)),
                        "source_ids": current_sources[:],
                    }
                )
            current_title = line[3:].strip()
            current_lines = []
            current_sources = []
            continue

        if line.startswith("来源："):
            continue

        source_match = re.match(r"- `([^`]+)`", line)
        if source_match:
            current_sources.append(source_match.group(1))
            continue

        if current_title:
            current_lines.append(line)

    if current_title and current_lines:
        sections.append(
            {
                "title": current_title,
                "body": normalize_whitespace("\n".join(current_lines)),
                "source_ids": current_sources[:],
            }
        )

    return sections


def build_faq_chunks(
    faq_rows: list[dict[str, Any]], source_map: dict[str, dict[str, Any]]
) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []

    for row in faq_rows:
        sources = [source_map[source_id]["title"] for source_id in row["source_ids"]]
        text = normalize_whitespace(
            "\n".join(
                [
                    f"问题：{row['question']}",
                    f"答案：{row['answer']}",
                    f"关键词：{'、'.join(row['keywords'])}",
                    f"来源说明：{row['source_note']}",
                ]
            )
        )

        chunks.append(
            {
                "chunk_id": row["id"],
                "chunk_type": "faq",
                "category": row["category"],
                "title": row["question"],
                "text": text,
                "keywords": row["keywords"],
                "source_ids": row["source_ids"],
                "source_titles": sources,
                "display_source": "；".join(sources),
            }
        )

    return chunks


def build_policy_chunks(
    policies_markdown: str, source_map: dict[str, dict[str, Any]]
) -> list[dict[str, Any]]:
    sections = parse_policy_sections(policies_markdown)
    chunks: list[dict[str, Any]] = []

    for index, section in enumerate(sections, start=1):
        source_titles = [
            source_map[source_id]["title"]
            for source_id in section["source_ids"]
            if source_id in source_map
        ]
        chunks.append(
            {
                "chunk_id": f"policy-{index:03d}",
                "chunk_type": "policy",
                "category": "规则",
                "title": section["title"],
                "text": section["body"],
                "keywords": [],
                "source_ids": section["source_ids"],
                "source_titles": source_titles,
                "display_source": "；".join(source_titles),
            }
        )

    return chunks


def build_product_chunks(
    product_rows: list[dict[str, Any]], source_map: dict[str, dict[str, Any]]
) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []

    for row in product_rows:
        sources = [source_map[source_id]["title"] for source_id in row["source_ids"]]
        for segment in row["segments"]:
            text = normalize_whitespace(
                "\n".join(
                    [
                        f"商品名称：{row['name']}",
                        f"商品分类：{row['category']}",
                        f"知识段落：{segment['segment_title']}",
                        *segment["content"],
                    ]
                )
            )

            segment_keywords = row["keywords"] + [segment["segment_title"]]
            chunks.append(
                {
                    "chunk_id": f"{row['id']}-{segment['segment_id']}",
                    "chunk_type": "product",
                    "category": "商品",
                    "title": f"{row['name']} · {segment['segment_title']}",
                    "text": text,
                    "keywords": segment_keywords,
                    "source_ids": row["source_ids"],
                    "source_titles": sources,
                    "display_source": "；".join(sources),
                }
            )

    return chunks


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    content = "\n".join(json.dumps(row, ensure_ascii=False) for row in rows)
    path.write_text(f"{content}\n", encoding="utf-8")


def main() -> None:
    faq_rows = load_jsonl(INPUT_DIR / "faq.jsonl")
    product_rows = load_jsonl(INPUT_DIR / "products.jsonl")
    source_rows = load_json(INPUT_DIR / "sources.json")
    policies_markdown = (INPUT_DIR / "policies.md").read_text(encoding="utf-8")
    source_map = {row["id"]: row for row in source_rows}

    faq_chunks = build_faq_chunks(faq_rows, source_map)
    policy_chunks = build_policy_chunks(policies_markdown, source_map)
    product_chunks = build_product_chunks(product_rows, source_map)
    all_chunks = faq_chunks + policy_chunks + product_chunks

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    write_jsonl(OUTPUT_DIR / "chunks.jsonl", all_chunks)
    (OUTPUT_DIR / "manifest.json").write_text(
        json.dumps(
            {
                "dataset": "ecommerce-kb-zh",
                "chunk_count": len(all_chunks),
                "faq_count": len(faq_chunks),
                "policy_count": len(policy_chunks),
                "product_count": len(product_chunks),
                "source_count": len(source_rows),
                "input_dir": str(INPUT_DIR.relative_to(ROOT)),
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    print(f"Built {len(all_chunks)} chunks into {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
