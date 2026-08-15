"use strict";

// EdgeOne Serverless 降级渲染器：用 sharp 将 SVG 渲染为 PNG，替代 Chromium 截图。
// 保留 H5 完整功能；帧画面为简洁排版（黑/白/红三色风格，匹配墨水屏面板）。

const crypto = require("node:crypto");
// sharp is loaded lazily: it is a native module and must never block server
// startup (auth/login). The frame PNG preview is a non-critical feature.
const { displayOrientation, panelConfig, panelProfile } = require("./domain");

function htmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function statusLabel(item) {
  if (item.daysRemaining < 0) return `已过期 ${Math.abs(item.daysRemaining)} 天`;
  if (item.daysRemaining === 0) return "今天到期";
  return `${item.daysRemaining} 天`;
}

function statusColor(item) {
  if (item.status === "expired") return "red";
  if (item.status === "expiring") return "red";
  return "black";
}

// 生成 SVG 画面：竖屏/横屏、面板尺寸均按 panelConfig 精确计算
function renderSvg(items, generatedAt, options, config, orientation) {
  const isPortrait = displayOrientation(orientation) === "portrait";
  const width = isPortrait ? config.height : config.width;
  const height = isPortrait ? config.width : config.height;
  const rowLimit = Math.max(3, Math.floor((height - (isPortrait ? 130 : 86)) / (isPortrait ? 44 : 34)));
  const rows = items.slice(0, rowLimit);
  const expiredCount = items.filter((item) => item.status === "expired").length;
  const expiringCount = items.filter((item) => item.status === "expiring").length;

  const BLACK = "#101010";
  const RED = "#c91c22";
  const WHITE = "#ffffff";

  const pad = isPortrait ? 12 : 16;
  const headerH = isPortrait ? 52 : 40;
  const summaryH = isPortrait ? 34 : 28;
  const footerH = isPortrait ? 26 : 20;

  let parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
  parts.push(`<rect width="${width}" height="${height}" fill="${WHITE}"/>`);

  // header
  let y = pad + (isPortrait ? 26 : 24);
  parts.push(`<text x="${pad}" y="${y}" font-size="${isPortrait ? 22 : 21}" font-weight="800" fill="${BLACK}">鲜知贴</text>`);
  parts.push(`<text x="${width - pad}" y="${y}" font-size="${isPortrait ? 10 : 11}" font-weight="600" fill="${BLACK}" text-anchor="end">${htmlEscape(generatedAt)}</text>`);
  const headerLineY = pad + headerH - 2;
  parts.push(`<line x1="${pad}" y1="${headerLineY}" x2="${width - pad}" y2="${headerLineY}" stroke="${BLACK}" stroke-width="2"/>`);

  // summary
  let sy = headerLineY + (isPortrait ? 20 : 16);
  const summaryText = expiredCount || expiringCount
    ? `${expiredCount ? `${expiredCount} 项已过期` : ""}${expiredCount && expiringCount ? "  " : ""}${expiringCount ? `${expiringCount} 项快过期` : ""}`
    : "物品状态正常";
  parts.push(`<text x="${pad}" y="${sy}" font-size="${isPortrait ? 13 : 12}" font-weight="700" fill="${RED}">${htmlEscape(summaryText)}</text>`);
  parts.push(`<text x="${width - pad}" y="${sy}" font-size="${isPortrait ? 11 : 11}" font-weight="600" fill="${BLACK}" text-anchor="end">全部物品 ${items.length} 项</text>`);

  // list
  let ly = sy + (isPortrait ? 14 : 12);
  if (!rows.length) {
    parts.push(`<text x="${width / 2}" y="${height / 2}" font-size="22" font-weight="700" fill="${BLACK}" text-anchor="middle">还没有物品</text>`);
    parts.push(`<text x="${width / 2}" y="${height / 2 + 28}" font-size="14" fill="${BLACK}" text-anchor="middle">请在手机页面添加</text>`);
  } else {
    rows.forEach((item, index) => {
      const rowTop = ly + index * (isPortrait ? 44 : 34);
      const color = statusColor(item) === "red" ? RED : BLACK;
      const name = htmlEscape(item.name);
      const meta = [item.category, item.location, item.quantityText].filter(Boolean).map(htmlEscape).join(" / ");
      const days = htmlEscape(statusLabel(item));
      // 圆点图标
      parts.push(`<circle cx="${pad + 6}" cy="${rowTop - 4}" r="5" fill="${color}"/>`);
      parts.push(`<text x="${pad + 20}" y="${rowTop}" font-size="${isPortrait ? 14 : 14}" font-weight="800" fill="${color}">${name}</text>`);
      parts.push(`<text x="${pad + 20}" y="${rowTop + (isPortrait ? 16 : 14)}" font-size="${isPortrait ? 9 : 10}" font-weight="600" fill="${BLACK}">${meta}</text>`);
      parts.push(`<text x="${width - pad}" y="${rowTop}" font-size="${isPortrait ? 13 : 13}" font-weight="800" fill="${color}" text-anchor="end">${days}</text>`);
      // 进度条
      const barY = rowTop + (isPortrait ? 26 : 22);
      const barW = Math.max(8, Math.min(100, Math.round((100 - Math.abs(item.daysRemaining) * 12) )));
      parts.push(`<line x1="${pad + 20}" y1="${barY}" x2="${width - pad}" y2="${barY}" stroke="${BLACK}" stroke-width="2"/>`);
      if (barW > 4) {
        parts.push(`<line x1="${pad + 20}" y1="${barY}" x2="${pad + 20 + Math.round((width - pad * 2 - 20) * barW / 100)}" y2="${barY}" stroke="${color}" stroke-width="3"/>`);
      }
    });
  }

  // footer
  const footerY = height - footerH;
  parts.push(`<line x1="${pad}" y1="${footerY - 6}" x2="${width - pad}" y2="${footerY - 6}" stroke="${BLACK}" stroke-width="2"/>`);
  parts.push(`<text x="${pad}" y="${footerY + 8}" font-size="11" font-weight="600" fill="${BLACK}">红色：已过期 / 快到期</text>`);
  parts.push(`<text x="${width - pad}" y="${footerY + 8}" font-size="10" font-weight="600" fill="${BLACK}" text-anchor="end">${config.id} / ${width} x ${height} ${isPortrait ? "竖屏" : "横屏"}</text>`);

  parts.push(`</svg>`);
  return parts.join("");
}

async function renderSvgPng(items, generatedAt, panel, orientation) {
  const profile = panelProfile(panel);
  const config = panelConfig(profile);
  const normalizedOrientation = displayOrientation(orientation);
  const svg = renderSvg(items, generatedAt, { panel: config.id, orientation: normalizedOrientation }, config, normalizedOrientation);
  const sharp = require("sharp");
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const etag = `"${crypto.createHash("sha256").update(png).digest("hex")}"`;
  return { etag, frame: png, frameFormat: config.frameFormat, png, html: svg };
}

module.exports = { renderSvg, renderSvgPng };
