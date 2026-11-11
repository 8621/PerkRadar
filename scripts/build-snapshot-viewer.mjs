import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(root, process.env.SNAPSHOT_SITE_DIR || ".snapshot-site");

/** 共享库沿用无扩展名导入；输出时补 .js，让浏览器原生模块能直接解析。 */
function browserImports(context) {
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const name = node.moduleSpecifier.text;
      if (name.startsWith(".") && !path.posix.extname(name)) {
        return context.factory.updateImportDeclaration(node, node.modifiers, node.importClause, context.factory.createStringLiteral(`${name}.js`), node.attributes);
      }
    }
    return ts.visitEachChild(node, visit, context);
  };
  return (source) => ts.visitNode(source, visit);
}

/** 只编译查看器及其真实依赖，独立于 Next 构建且不改写已有快照数据。 */
function buildViewer() {
  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
    strict: true,
    skipLibCheck: true,
    types: [],
    rootDir: root,
    outDir: output,
    noEmitOnError: true,
  };
  const program = ts.createProgram([path.join(root, "snapshot-viewer/viewer.ts")], options);
  const result = program.emit(undefined, undefined, undefined, undefined, { after: [browserImports] });
  const diagnostics = [...ts.getPreEmitDiagnostics(program), ...result.diagnostics];
  if (diagnostics.length) {
    console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (name) => name,
      getCurrentDirectory: () => root,
      getNewLine: () => "\n",
    }));
  }
  if (result.emitSkipped || diagnostics.some((entry) => entry.category === ts.DiagnosticCategory.Error)) {
    process.exitCode = 1;
    return;
  }
  fs.mkdirSync(path.join(output, "snapshot-viewer"), { recursive: true });
  fs.copyFileSync(path.join(root, "snapshot-viewer/index.html"), path.join(output, "index.html"));
  fs.copyFileSync(path.join(root, "src/components/deal-board.css"), path.join(output, "deal-board.css"));
  fs.copyFileSync(path.join(root, "snapshot-viewer/styles.css"), path.join(output, "snapshot-viewer/styles.css"));
  console.log(`静态快照查看器已构建：${output}`);
}

buildViewer();
