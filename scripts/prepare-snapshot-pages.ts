import fs from "node:fs";
import path from "node:path";
import { prepareSnapshotPublication, readPublicSnapshot } from "../src/lib/snapshot-publish";

/** 从文件读取经过校验的公开快照；只有可选历史文件不存在时才返回 null。 */
function loadSnapshot(file: string, optional: boolean) {
  if (optional && !fs.existsSync(file)) return null;
  const snapshot = readPublicSnapshot(JSON.parse(fs.readFileSync(file, "utf8")));
  if (!snapshot) throw new Error(`${path.basename(file)} 不是有效的公开快照，停止发布`);
  return snapshot;
}

/** 生成可部署的三份 JSON；绝不从当前目录猜测或读取生产数据库。 */
function main(): void {
  const input = process.env.DEALS_SNAPSHOT_DIR;
  const output = process.env.SNAPSHOT_SITE_DIR;
  if (!input || !output) throw new Error("需要设置 DEALS_SNAPSHOT_DIR 和 SNAPSHOT_SITE_DIR");
  const previousFile = process.env.SNAPSHOT_PREVIOUS_FILE;
  const previous = previousFile ? loadSnapshot(previousFile, true) : null;
  const current = loadSnapshot(path.join(input, "latest.json"), false)!;
  const publication = prepareSnapshotPublication(current, previous);
  fs.mkdirSync(output, { recursive: true });
  for (const [name, value] of Object.entries(publication)) {
    const target = path.join(output, `${name}.json`);
    const temporary = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
    fs.renameSync(temporary, target);
  }
  console.log(JSON.stringify({
    roundStatus: publication.status.roundStatus,
    retainedPrevious: publication.status.retainedPrevious,
    activeCount: publication.latest.activeCount,
    newCount: publication.latest.newCount,
  }));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
