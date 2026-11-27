import { access, cp, readdir, unlink } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../web/dist-mobile/", import.meta.url));
const target = fileURLToPath(new URL("./harmony/entry/src/main/resources/rawfile/workbench/", import.meta.url));

await access(join(source, "index.html"));
const paths = (entries, root) => entries.filter(entry => entry.isFile()).map(entry => relative(root, join(entry.parentPath, entry.name)));
const files = new Set(paths(await readdir(source, { recursive: true, withFileTypes: true }), source));
const previous = await readdir(target, { recursive: true, withFileTypes: true }).catch(error => {
    if (error.code !== "ENOENT") throw error;
    return [];
});
await cp(source, target, { recursive: true });
for (const path of paths(previous, target)) {
    if (!files.has(path)) await unlink(join(target, path));
}
