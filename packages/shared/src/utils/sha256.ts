import { digestSha2 } from "./sha2.js";

export async function sha256(bytes: ArrayBuffer) {
    const hash = await digestSha2("SHA-256", new Uint8Array(bytes));
    return Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const blobDigests = new WeakMap<Blob, Promise<string>>();

export function blobSha256(blob: Blob) {
    const known = blobDigests.get(blob);
    if (known) return known;
    const digest = blob.arrayBuffer().then(sha256);
    blobDigests.set(blob, digest);
    void digest.catch(() => blobDigests.delete(blob));
    return digest;
}
