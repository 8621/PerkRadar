// Production acceptance in an isolated copy. Never opens or migrates the real database.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const root = process.cwd();
const isolated = fs.mkdtempSync(path.join(os.tmpdir(), "perkradar-audit-"));
let server;
let serverLogPath;
const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR || os.tmpdir(), LANG: "en_US.UTF-8", NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", DISABLE_SCHEDULER: "1", PERKRADAR_OFFLINE: "1", DEALS_SNAPSHOT_DIR: "off", NEXT_DIST_DIR: ".next-audit" };
function run(command, args, extra = {}) {
  const result = spawnSync(command, args, { cwd: isolated, env: { ...env, ...extra }, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  assert.equal(result.status, 0, `${command} failed`);
}
async function port() {
  const socket = net.createServer();
  await new Promise((resolve, reject) => { socket.once("error", reject); socket.listen(0, "127.0.0.1", resolve); });
  const value = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return value;
}
async function stop() {
  if (!server) return;
  const child = server; server = null;
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(5000)]);
  if (child.exitCode === null) { child.kill("SIGKILL"); await new Promise((resolve) => child.once("exit", resolve)); }
}
async function start(token = "") {
  const listening = await port();
  const url = `http://127.0.0.1:${listening}`;
  const data = fs.mkdtempSync(path.join(isolated, "smoke-db-"));
  run(process.execPath, ["--import", "tsx", "-e", `const d=require('./src/lib/db.ts'); for(let i=0;i<3;i++) d.insertDeal({canonicalUrl:'https://www.v2ex.com/t/'+i,url:'https://www.v2ex.com/t/'+i,title:'SYNTHETIC smoke',summary:'',category:'其他',sourceId:'v2ex',publishedAt:Date.now(),expiresAt:null,firstSeenAt:Date.now(),firstSeenRoundId:0,updatedAt:Date.now()});d.useDatabase(null);`], { DATA_DIR: data });
  serverLogPath = path.join(data, "server.log");
  const logs = fs.openSync(serverLogPath, "w", 0o600);
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(listening)], { cwd: isolated, env: { ...env, DATA_DIR: data, PERKRADAR_ACCESS_TOKEN: token, PERKRADAR_SECURE_COOKIE: "0" }, stdio: ["ignore", logs, logs] });
  fs.closeSync(logs);
  let ready = false;
  for (let i = 0; i < 150; i++) {
    if (server.exitCode !== null) throw new Error("isolated server exited before readiness");
    try { const response = await fetch(url + "/login"); if (response.ok) { ready = true; break; } } catch { /* starting */ }
    await delay(100);
  }
  assert.ok(ready, "isolated server readiness timeout");
  return { url, token };
}
async function smoke(token = "") {
  const { url } = await start(token);
  const call = (route, init = {}) => fetch(url + route, { redirect: "manual", ...init });
  const auth = token ? { authorization: `Bearer ${token}` } : {};
  if (token) {
    for (const route of ["/api/deals", "/api/health", "/api/refresh"]) assert.equal((await call(route, { method: route.endsWith("refresh") ? "POST" : "GET" })).status, 401);
    const home = await call("/");
    if (home.status >= 500 && serverLogPath) console.error(fs.readFileSync(serverLogPath, "utf8").replaceAll(token, "[test-token-redacted]"));
    assert.equal(home.status, 307); assert.equal(new URL(home.headers.get("location"), url).pathname, "/login");
    assert.equal((await call("/api/deals", { headers: { authorization: "Bearer synthetic-invalid" } })).status, 401);
    const login = await call("/api/session", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: url }, body: new URLSearchParams({ token }) });
    assert.equal(login.status, 303);
    const cookie = login.headers.get("set-cookie"); assert.ok(cookie?.includes("HttpOnly")); assert.ok(cookie?.toLowerCase().includes("samesite=strict"));
    assert.equal((await call("/", { headers: { cookie: cookie.split(";")[0] } })).status, 200);
    assert.equal((await call("/api/health", { headers: { cookie: cookie.split(";")[0] + "tampered" } })).status, 401);
  }
  assert.equal((await call("/", { headers: auth })).status, 200);
  const health = await call("/api/health", { headers: auth }); assert.equal(health.status, 200); assert.equal((await health.json()).ok, true);
  const pageResponse = await call("/api/deals?limit=2&offset=0", { headers: auth }); assert.equal(pageResponse.status, 200);
  const page = await pageResponse.json(); assert.equal(page.deals.length, 2); assert.deepEqual(page.pagination, { offset: 0, limit: 2, total: 3, hasMore: true });
  const end = await (await call("/api/deals?limit=2&offset=2", { headers: auth })).json(); assert.equal(end.deals.length, 1); assert.equal(end.pagination.hasMore, false);
  assert.equal((await call("/api/deals?limit=-1", { headers: auth })).status, 400);
  const refresh = await call("/api/refresh", { method: "POST", headers: auth }); assert.equal(refresh.status, 200);
  const board = await refresh.json(); assert.equal(board.sourceHealth.ok, 0); assert.ok(board.failures.every((failure) => failure.error.includes("离线模式")));
  assert.equal((await call("/api/refresh", { method: "POST", headers: auth })).status, 429);
  console.log(`PASS production HTTP smoke: auth=${token ? "on" : "off"}; UI/API/session/paging/health/offline refresh`);
  await stop();
}
try {
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  for (const file of files) {
    if (file.split("/").some((part) => part.startsWith(".env") || part === ".secrets") || /^(data|reports|deployment-backups)\//.test(file)) throw new Error("Refusing sensitive build input");
    if (!fs.existsSync(path.join(root, file))) continue; // deleted source file
    const target = path.join(isolated, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(root, file), target);
  }
  // Real copy (not symlink): Turbopack cannot follow dependencies outside its filesystem root.
  fs.cpSync(path.join(root, "node_modules"), path.join(isolated, "node_modules"), { recursive: true, verbatimSymlinks: true });
  run("npm", ["run", "build"], { DATA_DIR: path.join(isolated, "build-db") });
  console.log("PASS isolated production build; original .next untouched");
  const original = path.join(root, "data", "deals.db");
  if (fs.existsSync(original)) {
    const copy = path.join(isolated, "migration-db"); fs.mkdirSync(copy);
    // Copy SQLite + current WAL/SHM as a set; open only this disposable copy.
    for (const name of ["deals.db", "deals.db-wal", "deals.db-shm"]) if (fs.existsSync(path.join(root, "data", name))) fs.copyFileSync(path.join(root, "data", name), path.join(copy, name));
    run(process.execPath, ["--import", "tsx", "-e", `const {DatabaseSync}=require('node:sqlite');const crypto=require('node:crypto');const d=require('./src/lib/db.ts');const f=process.env.DATA_DIR+'/deals.db';let db=new DatabaseSync(f);const hash=()=>crypto.createHash('sha256').update(JSON.stringify(db.prepare('SELECT * FROM deals ORDER BY id').all())).digest('hex');const before=hash();const counts=()=>['deals','rounds','source_runs','meta'].map(t=>Number(db.prepare('SELECT COUNT(*) AS n FROM '+t).get().n));const old=counts();if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('copied input integrity failed');db.close();db=d.openDatabase(f);if(hash()!==before||JSON.stringify(counts())!==JSON.stringify(old))throw Error('migration changed existing data');if(db.prepare('PRAGMA user_version').get().user_version!==1)throw Error('wrong version');db.close();db=d.openDatabase(f);if(hash()!==before)throw Error('second migration changed data');if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('post migration integrity failed');db.close();console.log('PASS copied real DB: v0->v1, second open idempotent, rows preserved, integrity ok; counts='+old.join('/'));`], { DATA_DIR: copy });
  } else console.log("SKIP real DB migration copy: data/deals.db does not exist");
  await smoke();
  await smoke(randomBytes(32).toString("hex"));
} finally {
  await stop();
  fs.rmSync(isolated, { recursive: true, force: true });
  console.log("CLEANUP isolated servers and temporary build/database copies removed");
}
