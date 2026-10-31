import type { TrendPoint } from "./rates";

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
  })[character]!);
}

/** Render locally: no chart service, API key, browser, or extra dependency. */
export function trendSvg(points: TrendPoint[], label: string, dark: boolean): string | undefined {
  if (points.length < 2) return undefined;
  const width = 640;
  const height = 300;
  const left = 82;
  const right = width - 22;
  const top = 42;
  const bottom = height - 42;
  const values = points.map(({ value }) => value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const padding = Math.max((high - low) * 0.12, high * 0.001);
  const minimum = low - padding;
  const maximum = high + padding;
  const start = Date.parse(points[0].date);
  const duration = Math.max(Date.parse(points[points.length - 1].date) - start, 1);
  const x = (date: string) => left + (Date.parse(date) - start) / duration * (right - left);
  const y = (value: number) => bottom - (value - minimum) / (maximum - minimum) * (bottom - top);
  const coordinates = points.map(({ date, value }) => `${x(date).toFixed(2)},${y(value).toFixed(2)}`);
  const color = values[values.length - 1] >= values[0] ? "#dc6d38" : "#3987ec";
  const text = dark ? "#d7dce4" : "#414a59";
  const grid = dark ? "#343b48" : "#e1e5ec";
  const axisFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
  const gridLines = [0, 0.5, 1].map((fraction) => {
    const value = minimum + (maximum - minimum) * fraction;
    const position = y(value).toFixed(2);
    return `<line x1="${left}" y1="${position}" x2="${right}" y2="${position}" stroke="${grid}"/>
      <text x="${left - 10}" y="${Number(position) + 5}" text-anchor="end">${axisFormat.format(value)}</text>`;
  }).join("");
  const last = points[points.length - 1];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <title>${escapeXml(label)} exchange-rate trend in KRW</title>
    <rect width="${width}" height="${height}" rx="12" fill="${dark ? "#171c25" : "#f8faff"}"/>
    <g font-family="Helvetica, Arial, sans-serif" font-size="14" fill="${text}">
      <text x="${left}" y="24">KRW per ${escapeXml(label)}</text>
      ${gridLines}
      <text x="${left}" y="${height - 12}">${points[0].date}</text>
      <text x="${right}" y="${height - 12}" text-anchor="end">${last.date}</text>
    </g>
    <polygon points="${left},${bottom} ${coordinates.join(" ")} ${right},${bottom}" fill="${color}" opacity="0.10"/>
    <polyline points="${coordinates.join(" ")}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(last.date).toFixed(2)}" cy="${y(last.value).toFixed(2)}" r="4" fill="${color}"/>
  </svg>`;
}

export function chartMarkdown(points: TrendPoint[], label: string, dark: boolean): string {
  const svg = trendSvg(points, label, dark);
  return svg
    ? `![${label} trend in KRW](data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")})`
    : "_A trend chart needs at least two published rates._";
}
