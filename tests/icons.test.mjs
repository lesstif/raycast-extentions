import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("each command has its own purpose-specific icon", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const expected = {
    "switch-audio": "audio-icon.png",
    "convert-currency": "currency-icon.png",
    "browse-exchange-rates": "exchange-rates-icon.png",
    "convert-timezones": "timezones-icon.png",
    "switch-wifi": "wifi-icon.png",
    "search-dictionaries": "dictionaries-icon.png",
  };
  assert.equal(manifest.icon, "tools-icon.png");
  assert.deepEqual(Object.fromEntries(manifest.commands.map(({ name, icon }) => [name, icon])), expected);
  const hashes = new Set();
  for (const file of [manifest.icon, ...Object.values(expected)]) {
    const png = await readFile(new URL(`../assets/${file}`, import.meta.url));
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", file);
    assert.equal(png.toString("ascii", 12, 16), "IHDR", file);
    assert.equal(png.readUInt32BE(16), 512, file);
    assert.equal(png.readUInt32BE(20), 512, file);
    hashes.add(createHash("sha256").update(png).digest("hex"));
  }
  assert.equal(hashes.size, Object.keys(expected).length + 1);
});
