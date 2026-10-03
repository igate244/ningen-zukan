// build.mjs — esbuild だけで組み立てる（依存を最小にするため Vite は使わない）
//   node build.mjs          → dist/ に本番ビルド
//   node build.mjs --serve  → http://localhost:5173 で開発サーバー
import * as esbuild from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const serve = process.argv.includes("--serve");
// アプリ本体は dist/app/ に置く（以前の dist/ 直下からの引っ越し。
// 同じドメインなので端末内のデータはそのまま引き継がれる）
const root = "dist";
const outdir = "dist/app";
const version = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);

rmSync(root, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });
cpSync("legacy", root, { recursive: true });
cpSync("public", outdir, { recursive: true });

const html = readFileSync("index.html", "utf8").replaceAll("__VERSION__", version);
writeFileSync(`${outdir}/index.html`, html);
const sw = readFileSync("public/sw.js", "utf8").replaceAll("__VERSION__", version);
writeFileSync(`${outdir}/sw.js`, sw);

const options = {
  entryPoints: ["src/main.tsx"],
  bundle: true,
  outfile: `${outdir}/app.js`,
  format: "esm",
  target: "es2020",
  jsx: "automatic",
  minify: !serve,
  sourcemap: serve,
  loader: { ".css": "css" },
  define: {
    "process.env.NODE_ENV": serve ? '"development"' : '"production"',
    __APP_VERSION__: JSON.stringify(version),
  },
  logLevel: "info",
};

if (serve) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: root, port: 5173, host: "0.0.0.0" });
  console.log(`dev server: http://localhost:${port}`);
} else {
  await esbuild.build(options);
  console.log(`built version ${version}`);
}
