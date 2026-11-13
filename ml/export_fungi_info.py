"""Bundle Wikipedia introductions for the app's fungal species and genera.

Reads the English Wikipedia dump on Hugging Face (wikimedia/wikipedia,
20231101.en, CC BY-SA), one parquet shard at a time, and keeps the lead
section of articles whose title is a catalog species, a catalog genus, or a
species' common name. Leads that do not mention fungi are dropped so that
genus names shared with other subjects are not matched.

Usage:
  python -m ml.export_fungi_info --names txt_emb_species.json --mobile-dir mobile
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path

from ml.export_bioclip2_fungi import fungal_indices

DUMP = "https://huggingface.co/datasets/wikimedia/wikipedia/resolve/main/20231101.en"
SHARDS = 41
MAX_LEAD = 1000
FUNGAL = re.compile(
    r"fung|mushroom|lichen|mould|\bmold|yeast|bolete|agaric|polypore|puffball|truffle|morel"
    r"|ascomycet|basidiomycet|smut|mycorrhiz|spore",
    re.I,
)


# The dump drops templates such as unit conversions, leaving gaps like "cap up to  in diameter".
MISSING_VALUE = re.compile(
    r"\s{2,}(?:in diameter|across|long|wide|thick|tall|high|deep|broad|cm|mm)\b|\bup to\s*,|\bby\s{2,}in\b"
)


def clean(text: str) -> str:
    """Drop sentences with a missing measurement and tidy leftover gaps."""
    sentences = re.split(r"(?<=[.!?])\s+(?=[A-Z])", text)
    text = " ".join(sentence for sentence in sentences if not MISSING_VALUE.search(sentence))
    return re.sub(r"\s+([,.;:])", r"\1", re.sub(r"\s{2,}", " ", text)).strip()


def lead(text: str) -> str:
    """First paragraphs up to the first section heading, cut at a sentence end."""
    paragraphs: list[str] = []
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue
        # The dump has no markup; section headings are short lines without end punctuation.
        if paragraphs and len(line) < 60 and not re.search(r"[.!?:;)\"]$", line):
            break
        paragraphs.append(line)
        if sum(len(p) for p in paragraphs) > MAX_LEAD + 200:
            break
    # The dump drops pronunciation templates, leaving empty brackets such as "Amanita phalloides (),".
    result = clean(re.sub(r"\s*\(\s*[;,]?\s*\)", "", " ".join(paragraphs)))
    if len(result) > MAX_LEAD:
        cut = result[:MAX_LEAD]
        end = cut.rfind(".")
        result = cut[:end + 1] if end > 200 else cut + "…"
    return result


def main() -> None:
    import pyarrow.parquet as pq

    parser = argparse.ArgumentParser()
    parser.add_argument("--names", required=True, help="TreeOfLife-200M txt_emb_species.json")
    parser.add_argument("--mobile-dir", default="mobile")
    parser.add_argument("--work-dir", default="build/wikipedia")
    args = parser.parse_args()

    names = json.loads(Path(args.names).read_text(encoding="utf-8"))
    species = [names[i] for i in fungal_indices(names)]
    by_label: dict[str, list[int]] = {}
    for index, (taxonomy, _) in enumerate(species):
        by_label.setdefault(f"{taxonomy[5]} {taxonomy[6]}", []).append(index)
    targets: dict[str, tuple[str, str]] = {label: ("species", label) for label in by_label}
    for taxonomy, _ in species:
        genus = taxonomy[5]
        for title in (genus, f"{genus} (fungus)", f"{genus} (genus)"):
            targets.setdefault(title, ("genus", genus))
    common = {name.lower(): f"{t[5]} {t[6]}" for t, name in species if name and name.isascii()}

    found: dict[str, dict[str, dict[str, str]]] = {"species": {}, "genus": {}}
    work = Path(args.work_dir)
    work.mkdir(parents=True, exist_ok=True)
    for shard in range(SHARDS):
        name = f"train-{shard:05d}-of-{SHARDS:05d}.parquet"
        path = work / name
        subprocess.run(["curl", "-sSL", "--fail", "-o", str(path), f"{DUMP}/{name}"], check=True)
        for batch in pq.ParquetFile(path).iter_batches(columns=["title", "text", "url"], batch_size=20000):
            columns = (batch.column(c).to_pylist() for c in ("title", "text", "url"))
            for title, text, url in zip(*columns):
                target = targets.get(title)
                if not target and title.lower() in common:
                    target = ("species", common[title.lower()])
                if not target:
                    continue
                summary = lead(text)
                if not FUNGAL.search(summary):
                    continue
                kind, key = target
                # Prefer the article titled with the scientific name over a common-name one.
                if key in found[kind] and found[kind][key]["title"] == key:
                    continue
                found[kind][key] = {"title": title, "url": url, "text": summary}
        path.unlink()
        print(name, len(found["species"]), len(found["genus"]), flush=True)

    info = {
        "source": "Wikipedia (English), 2023-11-01 dump, CC BY-SA",
        "species": {str(i): [v["title"], v["text"]] for label, v in found["species"].items() for i in by_label[label]},
        "genera": {genus: [v["title"], v["text"]] for genus, v in found["genus"].items()},
    }
    output = Path(args.mobile_dir) / "assets/fungiInfo.fungiinfo"
    output.write_text(json.dumps(info, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(f"{len(info['species'])} species and {len(info['genera'])} genera, {output.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
