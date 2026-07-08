#!/usr/bin/env python3
import base64
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen


def usage() -> None:
    print(f"Usage: {Path(sys.argv[0]).name} INPUT_JSON [OUTPUT_MD]", file=sys.stderr)


def load_local_env() -> None:
    script_dir = Path(__file__).resolve().parent
    env_path = script_dir.parent / ".env"
    if not env_path.is_file():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def sanitize_filename(name: str) -> str:
    clean = re.sub(r"[^A-Za-z0-9._-]", "_", name).strip("._")
    return clean or "image"


def unique_filename(directory: Path, name: str) -> str:
    candidate = sanitize_filename(name)
    stem = Path(candidate).stem
    suffix = Path(candidate).suffix
    counter = 1
    while (directory / candidate).exists():
        candidate = f"{stem}_{counter}{suffix}"
        counter += 1
    return candidate


def build_issue_link(data: dict) -> str:
    key = data.get("key", "")
    if not key:
        return ""

    jira_base = os.getenv("JIRA_BASE", "").rstrip("/")
    if jira_base:
        return f"{jira_base}/browse/{key}"

    self_url = data.get("self", "")
    if isinstance(self_url, str) and self_url:
        parsed = urlparse(self_url)
        if parsed.scheme and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}/browse/{key}"

    return key


def auth_header() -> str | None:
    email = os.getenv("JIRA_EMAIL", "")
    token = os.getenv("JIRA_API_TOKEN", "")
    if not email or not token:
        return None
    raw = f"{email}:{token}".encode("utf-8")
    encoded = base64.b64encode(raw).decode("ascii")
    return f"Basic {encoded}"


def is_image_attachment(item: dict) -> bool:
    mime_type = str(item.get("mimeType", "")).lower()
    filename = str(item.get("filename", "")).lower()
    if mime_type.startswith("image/"):
        return True
    return filename.endswith((".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg"))


def download_images(fields: dict, output_md: Path) -> dict:
    attachments = fields.get("attachment", [])
    if not isinstance(attachments, list):
        return {"by_id": {}, "all": [], "downloaded_any": False}

    images = [item for item in attachments if isinstance(item, dict) and is_image_attachment(item)]
    if not images:
        return {"by_id": {}, "all": [], "downloaded_any": False}

    assets_dir = output_md.parent / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)
    rel_assets_prefix = quote(assets_dir.name)

    header = auth_header()
    results_by_id = {}
    results_all = []
    downloaded_any = False

    for image in images:
        att_id = str(image.get("id", ""))
        content_url = str(image.get("content", ""))
        original_name = str(image.get("filename", "image"))
        local_name = unique_filename(assets_dir, original_name)
        local_path = assets_dir / local_name
        rel_path = f"{rel_assets_prefix}/{quote(local_name)}"

        downloaded = False
        if content_url and header:
            try:
                request = Request(content_url, headers={"Authorization": header, "Accept": "*/*"})
                with urlopen(request, timeout=60) as response:
                    local_path.write_bytes(response.read())
                downloaded = True
                downloaded_any = True
            except Exception as exc:
                print(f"Warning: failed to download {original_name}: {exc}", file=sys.stderr)
        elif content_url:
            print(
                "Warning: JIRA_EMAIL/JIRA_API_TOKEN not available; skipping image downloads.",
                file=sys.stderr,
            )
            header = None

        entry = {
            "id": att_id,
            "filename": original_name,
            "content": content_url,
            "rel_path": rel_path,
            "downloaded": downloaded,
        }
        if att_id:
            results_by_id[att_id] = entry
        results_all.append(entry)

    if not downloaded_any:
        try:
            assets_dir.rmdir()
        except OSError:
            pass

    return {"by_id": results_by_id, "all": results_all, "downloaded_any": downloaded_any}


def apply_marks(text: str, marks: list) -> str:
    if not text:
        return ""
    result = text
    link_href = None

    for mark in marks:
        if not isinstance(mark, dict):
            continue
        mark_type = mark.get("type")
        if mark_type == "code":
            result = f"`{result}`"
        elif mark_type == "strong":
            result = f"**{result}**"
        elif mark_type == "em":
            result = f"*{result}*"
        elif mark_type == "strike":
            result = f"~~{result}~~"
        elif mark_type == "link":
            link_href = str(mark.get("attrs", {}).get("href", ""))

    if link_href:
        result = f"[{result}]({link_href})"
    return result


def render_inline(node: dict, images: dict, fallback_index: list[int]) -> str:
    node_type = node.get("type")

    if node_type == "text":
        return apply_marks(str(node.get("text", "")), node.get("marks", []))

    if node_type == "hardBreak":
        return "  \n"

    if node_type == "emoji":
        return str(node.get("attrs", {}).get("text", ""))

    if node_type == "mention":
        attrs = node.get("attrs", {})
        return str(attrs.get("text") or attrs.get("id") or "")

    if node_type in {"inlineCard", "link"}:
        url = str(node.get("attrs", {}).get("url", ""))
        return f"[{url}]({url})" if url else ""

    if node_type in {"media", "mediaSingle", "mediaGroup"}:
        return render_media_inline(node, images, fallback_index)

    content = node.get("content", [])
    if isinstance(content, list):
        return "".join(render_inline(child, images, fallback_index) for child in content if isinstance(child, dict))
    return ""


def render_media_inline(node: dict, images: dict, fallback_index: list[int]) -> str:
    if node.get("type") in {"mediaSingle", "mediaGroup"}:
        children = node.get("content", [])
        links = [render_media_inline(child, images, fallback_index) for child in children if isinstance(child, dict)]
        links = [item for item in links if item]
        return "\n\n".join(links)

    attrs = node.get("attrs", {})
    media_id = str(attrs.get("id", ""))
    alt = str(attrs.get("alt", "image"))
    matched = images["by_id"].get(media_id)

    if not matched and fallback_index[0] < len(images["all"]):
        matched = images["all"][fallback_index[0]]
        fallback_index[0] += 1

    if not matched:
        return ""

    label = alt or matched["filename"]
    target = matched["rel_path"] if matched["downloaded"] else matched["content"]
    if not target:
        return ""
    return f"![{label}]({target})"


def render_blocks(nodes, images: dict, indent: int = 0, fallback_index: list[int] | None = None) -> str:
    if fallback_index is None:
        fallback_index = [0]

    lines = []
    for node in nodes if isinstance(nodes, list) else []:
        if not isinstance(node, dict):
            continue

        node_type = node.get("type")
        content = node.get("content", [])

        if node_type == "paragraph":
            text = "".join(render_inline(child, images, fallback_index) for child in content if isinstance(child, dict)).strip()
            lines.append((" " * indent) + text if text else "")
            lines.append("")
        elif node_type == "heading":
            level = int(node.get("attrs", {}).get("level", 2))
            level = max(1, min(6, level))
            text = "".join(render_inline(child, images, fallback_index) for child in content if isinstance(child, dict)).strip()
            if text:
                lines.append(f"{'#' * level} {text}")
                lines.append("")
        elif node_type == "bulletList":
            lines.extend(render_list(content, images, indent, False, fallback_index))
            lines.append("")
        elif node_type == "orderedList":
            lines.extend(render_list(content, images, indent, True, fallback_index))
            lines.append("")
        elif node_type == "blockquote":
            block = render_blocks(content, images, indent=0, fallback_index=fallback_index).strip().splitlines()
            for row in block:
                lines.append(f"> {row}" if row else ">")
            lines.append("")
        elif node_type == "codeBlock":
            language = str(node.get("attrs", {}).get("language", "")).strip()
            code_text = "".join(render_inline(child, images, fallback_index) for child in content if isinstance(child, dict))
            lines.append(f"```{language}")
            lines.extend(code_text.rstrip("\n").splitlines() or [""])
            lines.append("```")
            lines.append("")
        elif node_type == "rule":
            lines.append("---")
            lines.append("")
        elif node_type == "table":
            lines.extend(render_table(content, images, fallback_index))
            lines.append("")
        elif node_type == "panel":
            panel_text = render_blocks(content, images, indent=0, fallback_index=fallback_index).strip().splitlines()
            panel_type = str(node.get("attrs", {}).get("panelType", "note")).upper()
            lines.append(f"> **{panel_type}**")
            for row in panel_text:
                lines.append(f"> {row}" if row else ">")
            lines.append("")
        else:
            nested = render_blocks(content, images, indent=indent, fallback_index=fallback_index)
            if nested.strip():
                lines.append(nested.rstrip())
                lines.append("")

    while lines and lines[-1] == "":
        lines.pop()
    return "\n".join(lines)


def render_list(items, images: dict, indent: int, ordered: bool, fallback_index: list[int]) -> list[str]:
    output = []
    counter = 1
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict) or item.get("type") != "listItem":
            continue

        prefix = f"{counter}. " if ordered else "- "
        counter += 1
        sub_items = item.get("content", [])

        first_line = ""
        remainder_blocks = []
        for child in sub_items:
            if not isinstance(child, dict):
                continue
            if child.get("type") == "paragraph" and not first_line:
                first_line = "".join(
                    render_inline(grand, images, fallback_index)
                    for grand in child.get("content", [])
                    if isinstance(grand, dict)
                ).strip()
            else:
                remainder_blocks.append(child)

        output.append((" " * indent) + prefix + first_line)
        if remainder_blocks:
            nested = render_blocks(remainder_blocks, images, indent=indent + 2, fallback_index=fallback_index)
            if nested:
                output.extend(nested.splitlines())

    return output


def render_table(rows, images: dict, fallback_index: list[int]) -> list[str]:
    parsed_rows = []
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, dict) or row.get("type") != "tableRow":
            continue
        cells = []
        for cell in row.get("content", []):
            if not isinstance(cell, dict) or cell.get("type") not in {"tableHeader", "tableCell"}:
                continue
            text = render_blocks(cell.get("content", []), images, fallback_index=fallback_index)
            text = " ".join(part.strip() for part in text.splitlines() if part.strip())
            cells.append(text or " ")
        if cells:
            parsed_rows.append(cells)

    if not parsed_rows:
        return []

    width = max(len(row) for row in parsed_rows)
    normalized = [row + [" "] * (width - len(row)) for row in parsed_rows]
    header = normalized[0]
    divider = ["---"] * width
    body = normalized[1:] if len(normalized) > 1 else []

    lines = [
        "| " + " | ".join(header) + " |",
        "| " + " | ".join(divider) + " |",
    ]
    for row in body:
        lines.append("| " + " | ".join(row) + " |")
    return lines


def build_image_section(images: dict) -> str:
    if not images["all"]:
        return ""

    lines = ["## Image Attachments", ""]
    for item in images["all"]:
        target = item["rel_path"] if item["downloaded"] else item["content"]
        if not target:
            continue
        lines.append(f"- ![{item['filename']}]({target})")
    if len(lines) == 2:
        return ""
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    if len(sys.argv) < 2 or len(sys.argv) > 3:
        usage()
        return 1

    load_local_env()

    input_path = Path(sys.argv[1])
    if not input_path.is_file():
        print(f"Input JSON not found: {input_path}", file=sys.stderr)
        return 1

    output_path = Path(sys.argv[2]) if len(sys.argv) == 3 else input_path.with_suffix(".md")

    try:
        data = json.loads(input_path.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"Failed to read JSON: {exc}", file=sys.stderr)
        return 1

    key = data.get("key", "UNKNOWN")
    fields = data.get("fields", {}) if isinstance(data, dict) else {}
    title = fields.get("summary") or "(no title)"
    link = build_issue_link(data) or "(link unavailable)"

    output_path.parent.mkdir(parents=True, exist_ok=True)
    image_data = download_images(fields, output_path)

    description_adf = fields.get("description", {})
    if isinstance(description_adf, dict):
        description_nodes = description_adf.get("content", [])
    else:
        description_nodes = []
    description = render_blocks(description_nodes, image_data).strip() or "(no description)"
    image_section = build_image_section(image_data)

    markdown = (
        f"# {key}: {title}\n\n"
        f"- **Title:** {title}\n"
        f"- **Link:** [{key}]({link})\n\n"
        f"## Description\n\n"
        f"{description}\n\n"
        f"{image_section}"
    ).rstrip() + "\n"

    output_path.write_text(markdown, encoding="utf-8")
    input_path.unlink()

    print(f"Saved {output_path}")
    if image_data["downloaded_any"]:
        assets_dir = output_path.parent / "assets"
        print(f"Saved image assets in {assets_dir}")
    print(f"Deleted {input_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
