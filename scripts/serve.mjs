import { spawn } from "node:child_process";
// Avoid shell interpolation: HOST is an argument, never executable text.
const mode = process.argv[2];
if (!["dev", "start"].includes(mode)) throw new Error("Invalid server mode");
const args = ["node_modules/next/dist/bin/next", mode, "-H", process.env.HOST || "127.0.0.1", "-p", process.env.PORT || "38471"];
if (mode === "dev") args.push("--turbopack");
const child = spawn(process.execPath, args, { stdio: "inherit" });
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
child.on("error", () => process.exit(1));
child.on("exit", (code) => process.exit(code ?? 1));
