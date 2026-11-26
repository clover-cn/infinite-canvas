export async function digestSha2(algorithm: "SHA-256" | "SHA-512", bytes: Uint8Array<ArrayBuffer>) {
    const subtle = globalThis.crypto?.subtle;
    if (subtle) return new Uint8Array(await subtle.digest(algorithm, bytes));

    const { sha256, sha512 } = await import("@noble/hashes/sha2.js");
    return algorithm === "SHA-256" ? sha256(bytes) : sha512(bytes);
}
