const fs = require("node:fs");
const path = require("node:path");

function sanitizeFilename(name) {
  const clean = String(name).replace(/[^A-Za-z0-9._-]/g, "_").replace(/^[._]+|[._]+$/g, "");
  return clean || "image";
}

function uniqueFilename(directory, name) {
  const candidateBase = sanitizeFilename(name);
  const ext = path.extname(candidateBase);
  const stem = candidateBase.slice(0, candidateBase.length - ext.length) || "image";
  let candidate = candidateBase;
  let counter = 1;
  while (fs.existsSync(path.join(directory, candidate))) {
    candidate = `${stem}_${counter}${ext}`;
    counter += 1;
  }
  return candidate;
}

function buildIssueLink(data, env) {
  const key = data && data.key ? String(data.key) : "";
  if (!key) {
    return "";
  }
  const jiraBase = env.JIRA_BASE ? String(env.JIRA_BASE).replace(/\/$/, "") : "";
  if (jiraBase) {
    return `${jiraBase}/browse/${key}`;
  }
  const selfUrl = data && data.self ? String(data.self) : "";
  if (selfUrl) {
    try {
      const parsed = new URL(selfUrl);
      return `${parsed.protocol}//${parsed.host}/browse/${key}`;
    } catch {
      return key;
    }
  }
  return key;
}

function isImageAttachment(item) {
  const mimeType = (item.mimeType || "").toLowerCase();
  const filename = (item.filename || "").toLowerCase();
  return mimeType.startsWith("image/") || /\.(png|jpe?g|gif|bmp|webp|svg)$/.test(filename);
}

async function downloadImages(fields, outputMdPath, env, onWarn) {
  const attachments = Array.isArray(fields.attachment) ? fields.attachment : [];
  const images = attachments.filter((item) => item && typeof item === "object" && isImageAttachment(item));
  if (images.length === 0) {
    return { byId: {}, all: [], downloadedAny: false };
  }

  const outputDir = path.dirname(outputMdPath);
  const assetsDir = path.join(outputDir, "assets");
  fs.mkdirSync(assetsDir, { recursive: true });

  const auth = Buffer.from(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`).toString("base64");
  const byId = {};
  const all = [];
  let downloadedAny = false;

  for (const image of images) {
    const contentUrl = String(image.content || "");
    const originalName = String(image.filename || "image");
    const localName = uniqueFilename(assetsDir, originalName);
    const localPath = path.join(assetsDir, localName);
    const relPath = `assets/${encodeURIComponent(localName)}`;
    const attId = String(image.id || "");

    let downloaded = false;
    if (contentUrl) {
      try {
        const response = await fetch(contentUrl, {
          headers: {
            Authorization: `Basic ${auth}`,
            Accept: "*/*"
          }
        });
        if (response.ok) {
          const body = await response.arrayBuffer();
          fs.writeFileSync(localPath, Buffer.from(body));
          downloaded = true;
          downloadedAny = true;
        } else if (onWarn) {
          onWarn(`Failed to download ${originalName}: ${response.status} ${response.statusText}`);
        }
      } catch (error) {
        if (onWarn) {
          onWarn(`Failed to download ${originalName}: ${error.message}`);
        }
      }
    }

    const entry = {
      id: attId,
      filename: originalName,
      content: contentUrl,
      relPath,
      downloaded
    };
    if (attId) {
      byId[attId] = entry;
    }
    all.push(entry);
  }

  if (!downloadedAny) {
    try {
      fs.rmdirSync(assetsDir);
    } catch {
      // ignore
    }
  }

  return { byId, all, downloadedAny };
}

function applyMarks(text, marks) {
  let result = text || "";
  let linkHref = "";
  for (const mark of Array.isArray(marks) ? marks : []) {
    if (!mark || typeof mark !== "object") {
      continue;
    }
    if (mark.type === "code") {
      result = `\`${result}\``;
    } else if (mark.type === "strong") {
      result = `**${result}**`;
    } else if (mark.type === "em") {
      result = `*${result}*`;
    } else if (mark.type === "strike") {
      result = `~~${result}~~`;
    } else if (mark.type === "link") {
      linkHref = String((mark.attrs || {}).href || "");
    }
  }
  if (linkHref) {
    return `[${result}](${linkHref})`;
  }
  return result;
}

function renderMediaInline(node, images, fallbackIndex) {
  if (node.type === "mediaSingle" || node.type === "mediaGroup") {
    const children = Array.isArray(node.content) ? node.content : [];
    return children
      .filter((child) => child && typeof child === "object")
      .map((child) => renderMediaInline(child, images, fallbackIndex))
      .filter(Boolean)
      .join("\n\n");
  }

  const attrs = node.attrs || {};
  const mediaId = String(attrs.id || "");
  let matched = images.byId[mediaId];
  if (!matched && fallbackIndex.value < images.all.length) {
    matched = images.all[fallbackIndex.value];
    fallbackIndex.value += 1;
  }
  if (!matched) {
    return "";
  }
  const label = String(attrs.alt || matched.filename || "image");
  const target = matched.downloaded ? matched.relPath : matched.content;
  if (!target) {
    return "";
  }
  return `![${label}](${target})`;
}

function renderInline(node, images, fallbackIndex) {
  const nodeType = node.type;
  if (nodeType === "text") {
    return applyMarks(String(node.text || ""), node.marks || []);
  }
  if (nodeType === "hardBreak") {
    return "  \n";
  }
  if (nodeType === "emoji") {
    return String((node.attrs || {}).text || "");
  }
  if (nodeType === "mention") {
    const attrs = node.attrs || {};
    return String(attrs.text || attrs.id || "");
  }
  if (nodeType === "inlineCard" || nodeType === "link") {
    const url = String((node.attrs || {}).url || "");
    return url ? `[${url}](${url})` : "";
  }
  if (nodeType === "media" || nodeType === "mediaSingle" || nodeType === "mediaGroup") {
    return renderMediaInline(node, images, fallbackIndex);
  }
  const content = Array.isArray(node.content) ? node.content : [];
  return content.filter((child) => child && typeof child === "object").map((child) => renderInline(child, images, fallbackIndex)).join("");
}

function renderList(items, images, indent, ordered, fallbackIndex) {
  const output = [];
  let counter = 1;
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || item.type !== "listItem") {
      continue;
    }
    const prefix = ordered ? `${counter}. ` : "- ";
    counter += 1;
    const subItems = Array.isArray(item.content) ? item.content : [];
    let firstLine = "";
    const remainder = [];
    for (const child of subItems) {
      if (!child || typeof child !== "object") {
        continue;
      }
      if (child.type === "paragraph" && !firstLine) {
        const inline = Array.isArray(child.content) ? child.content : [];
        firstLine = inline.filter((g) => g && typeof g === "object").map((g) => renderInline(g, images, fallbackIndex)).join("").trim();
      } else {
        remainder.push(child);
      }
    }
    output.push(`${" ".repeat(indent)}${prefix}${firstLine}`);
    if (remainder.length > 0) {
      const nested = renderBlocks(remainder, images, indent + 2, fallbackIndex);
      if (nested) {
        output.push(...nested.split("\n"));
      }
    }
  }
  return output;
}

function renderTable(rows, images, fallbackIndex) {
  const parsedRows = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || row.type !== "tableRow") {
      continue;
    }
    const cells = [];
    for (const cell of Array.isArray(row.content) ? row.content : []) {
      if (!cell || (cell.type !== "tableHeader" && cell.type !== "tableCell")) {
        continue;
      }
      const text = renderBlocks(cell.content || [], images, 0, fallbackIndex);
      const normalized = text
        .split("\n")
        .map((part) => part.trim())
        .filter(Boolean)
        .join(" ");
      cells.push(normalized || " ");
    }
    if (cells.length > 0) {
      parsedRows.push(cells);
    }
  }
  if (parsedRows.length === 0) {
    return [];
  }
  const width = Math.max(...parsedRows.map((row) => row.length));
  const normalized = parsedRows.map((row) => row.concat(Array(width - row.length).fill(" ")));
  const header = normalized[0];
  const divider = Array(width).fill("---");
  const lines = [`| ${header.join(" | ")} |`, `| ${divider.join(" | ")} |`];
  for (const row of normalized.slice(1)) {
    lines.push(`| ${row.join(" | ")} |`);
  }
  return lines;
}

function renderBlocks(nodes, images, indent = 0, fallbackIndex = { value: 0 }) {
  const lines = [];
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (!node || typeof node !== "object") {
      continue;
    }
    const nodeType = node.type;
    const content = Array.isArray(node.content) ? node.content : [];

    if (nodeType === "paragraph") {
      const text = content.filter((child) => child && typeof child === "object").map((child) => renderInline(child, images, fallbackIndex)).join("").trim();
      lines.push(text ? `${" ".repeat(indent)}${text}` : "");
      lines.push("");
    } else if (nodeType === "heading") {
      const level = Math.max(1, Math.min(6, Number((node.attrs || {}).level || 2)));
      const text = content.filter((child) => child && typeof child === "object").map((child) => renderInline(child, images, fallbackIndex)).join("").trim();
      if (text) {
        lines.push(`${"#".repeat(level)} ${text}`);
        lines.push("");
      }
    } else if (nodeType === "bulletList") {
      lines.push(...renderList(content, images, indent, false, fallbackIndex));
      lines.push("");
    } else if (nodeType === "orderedList") {
      lines.push(...renderList(content, images, indent, true, fallbackIndex));
      lines.push("");
    } else if (nodeType === "blockquote") {
      const block = renderBlocks(content, images, 0, fallbackIndex).trim().split("\n");
      for (const row of block) {
        lines.push(row ? `> ${row}` : ">");
      }
      lines.push("");
    } else if (nodeType === "codeBlock") {
      const language = String((node.attrs || {}).language || "").trim();
      const codeText = content.filter((child) => child && typeof child === "object").map((child) => renderInline(child, images, fallbackIndex)).join("");
      lines.push(`\`\`\`${language}`);
      lines.push(...(codeText.replace(/\n+$/, "").split("\n").length ? codeText.replace(/\n+$/, "").split("\n") : [""]));
      lines.push("```");
      lines.push("");
    } else if (nodeType === "rule") {
      lines.push("---");
      lines.push("");
    } else if (nodeType === "table") {
      lines.push(...renderTable(content, images, fallbackIndex));
      lines.push("");
    } else if (nodeType === "panel") {
      const panelText = renderBlocks(content, images, 0, fallbackIndex).trim().split("\n");
      const panelType = String((node.attrs || {}).panelType || "note").toUpperCase();
      lines.push(`> **${panelType}**`);
      for (const row of panelText) {
        lines.push(row ? `> ${row}` : ">");
      }
      lines.push("");
    } else {
      const nested = renderBlocks(content, images, indent, fallbackIndex);
      if (nested.trim()) {
        lines.push(nested.replace(/\n+$/, ""));
        lines.push("");
      }
    }
  }
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines.join("\n");
}

function buildImageSection(images) {
  if (!images.all || images.all.length === 0) {
    return "";
  }
  const lines = ["## Image Attachments", ""];
  for (const item of images.all) {
    const target = item.downloaded ? item.relPath : item.content;
    if (!target) {
      continue;
    }
    lines.push(`- ![${item.filename}](${target})`);
  }
  if (lines.length === 2) {
    return "";
  }
  lines.push("");
  return lines.join("\n");
}

async function renderIssueMarkdownFromJson(data, outputPath, env, onWarn) {
  const key = data && data.key ? String(data.key) : "UNKNOWN";
  const fields = data && typeof data.fields === "object" ? data.fields : {};
  const title = fields.summary || "(no title)";
  const link = buildIssueLink(data, env) || "(link unavailable)";

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const imageData = await downloadImages(fields, outputPath, env, onWarn);
  const descriptionAdf = fields.description && typeof fields.description === "object" ? fields.description : {};
  const description = renderBlocks(descriptionAdf.content || [], imageData).trim() || "(no description)";
  const imageSection = buildImageSection(imageData);

  const markdown = (
    `# ${key}: ${title}\n\n` +
    `- **Title:** ${title}\n` +
    `- **Link:** [${key}](${link})\n\n` +
    `## Description\n\n` +
    `${description}\n\n` +
    `${imageSection}`
  ).replace(/\s+$/, "") + "\n";

  fs.writeFileSync(outputPath, markdown, "utf8");
  return {
    outputPath,
    downloadedAny: imageData.downloadedAny,
    assetsDir: path.join(path.dirname(outputPath), "assets")
  };
}

module.exports = {
  renderIssueMarkdownFromJson
};
