import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const START = "<!-- star-history:start -->";
const END = "<!-- star-history:end -->";
const root = resolve(process.env.STAR_HISTORY_ROOT || process.cwd());
const repo = process.env.GITHUB_REPOSITORY || "luobinger/PerkRadar";
const directory = "assets/star-history";

/** 给本仓库生成的 SVG 加上时间和版本；只有内容变化时才更新 README。 */
async function updateChart() {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("无效的 GitHub 仓库名");
  const readmeFile = resolve(root, "README.md");
  const readme = await readFile(readmeFile, "utf8");
  if (readme.split(START).length !== 2 || readme.split(END).length !== 2) {
    throw new Error("README 必须包含唯一一对 Star History 标记");
  }
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);
  if (end < start) throw new Error("Star History 标记顺序错误");

  const updated = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai", dateStyle: "short", timeStyle: "short",
  }).format(new Date());
  const images = [];
  for (const theme of ["light", "dark"]) {
    const path = `${directory}/star-history-${theme}.svg`;
    let svg = (await readFile(resolve(root, path), "utf8")).trim();
    if (!/^<svg\b/.test(svg) || !svg.endsWith("</svg>")) throw new Error(`${path} 不是完整的 SVG`);
    if (/<script\b|<foreignObject\b|\son\w+\s*=/i.test(svg)) throw new Error(`${path} 包含不允许的活动内容`);
    // 脚本可重复执行：同一份图已带时间时保留原值，不制造无意义提交。
    if (!svg.includes('id="perkradar-chart-updated"')) {
      const height = Number(svg.match(/\bheight="([\d.]+)"/)?.[1]);
      if (!Number.isFinite(height) || height < 100) throw new Error(`${path} 缺少有效高度`);
      const color = theme === "dark" ? "#b1bac4" : "#57606a";
      // 给时间戳留一行，保持原坐标轴和曲线的位置不变。
      svg = svg.replace(/\bheight="[\d.]+"/, `height="${height + 24}"`);
      const stamp = `<text id="perkradar-chart-updated" x="50%" y="${height + 17}" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" fill="${color}">Updated ${updated} (UTC+8)</text>`;
      svg = svg.replace(/<\/svg>$/, `${stamp}</svg>`);
    }
    const version = createHash("sha256").update(svg).digest("hex").slice(0, 16);
    images.push({ path, version, svg });
  }
  const [light, dark] = images;
  const block = [
    START,
    `<a href="https://www.star-history.com/?repos=${repo}&type=date">`,
    "  <picture>",
    `    <source media="(prefers-color-scheme: dark)" srcset="${dark.path}?v=${dark.version}">`,
    `    <img alt="${repo} Star history" src="${light.path}?v=${light.version}" width="800">`,
    "  </picture>",
    "</a>",
    END,
  ].join("\n");
  const next = readme.slice(0, start) + block + readme.slice(end + END.length);
  for (const image of images) await writeFile(resolve(root, image.path), `${image.svg}\n`);
  if (next !== readme) await writeFile(readmeFile, next);
  console.log(`Star History: ${repo}; light=${light.version}; dark=${dark.version}`);
}

await updateChart();
