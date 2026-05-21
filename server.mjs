import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const port = Number(process.env.PORT || 5173);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function resolvePath(urlPath) {
  const pathname = decodeURIComponent((urlPath || "/").split("?")[0]);
  return pathname === "/" ? "/index.html" : pathname;
}

createServer(async (request, response) => {
  const safeRelativePath = resolvePath(request.url);
  const safeAbsolutePath = path.normalize(path.join(rootDir, safeRelativePath));

  if (!safeAbsolutePath.startsWith(rootDir)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(safeAbsolutePath);
    const extension = path.extname(safeAbsolutePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
    });
    response.end(file);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}).listen(port, () => {
  console.log(`Lofi Web running on http://localhost:${port}`);
});
