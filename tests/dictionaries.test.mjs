import assert from "node:assert/strict";
import test from "node:test";
import { dictionaries, dictionaryUrl } from "../src/modules/dictionaries/dictionaries.ts";

test("offers the six requested dictionaries with five English-only options", () => {
  assert.deepEqual(dictionaries.map(({ id }) => id), [
    "cambridge", "oxford", "merriam-webster", "collins", "dictionary-com", "naver",
  ]);
  assert.equal(dictionaries.filter(({ language }) => language === "English–English").length, 5);
});

function readQuery(dictionary, input) {
  const url = new URL(dictionaryUrl(dictionary, input));
  if (dictionary.id === "naver") return new URLSearchParams(url.hash.split("?")[1]).get("query");
  if (["merriam-webster", "dictionary-com"].includes(dictionary.id)) {
    return decodeURIComponent(url.pathname.split("/").at(-1));
  }
  return url.searchParams.get("q");
}

for (const dictionary of dictionaries) {
  test(`${dictionary.name}: trims words and preserves phrases and reserved characters`, () => {
    for (const input of ["  incumbent  ", "take into account", "a&b/?#%+=", "café", "hello 뜻"]) {
      assert.equal(readQuery(dictionary, input), input.trim());
      assert.equal(new URL(dictionaryUrl(dictionary, input)).protocol, "https:");
      assert.equal(new URL(dictionaryUrl(dictionary, input)).host, new URL(dictionary.homeUrl).host);
    }
  });

  test(`${dictionary.name}: empty input opens its homepage`, () => {
    for (const input of ["", "   ", "\t\n"]) {
      assert.equal(dictionaryUrl(dictionary, input), dictionary.homeUrl);
    }
  });
}

test("Collins keeps the English dictionary and Naver keeps its client-side route", () => {
  const collins = new URL(dictionaryUrl(dictionaries.find(({ id }) => id === "collins"), "a&b"));
  assert.equal(collins.searchParams.get("dictCode"), "english");
  assert.equal(collins.searchParams.size, 2);
  const naver = new URL(dictionaryUrl(dictionaries.find(({ id }) => id === "naver"), "hello"));
  assert.equal(naver.search, "");
  assert.equal(naver.hash, "#/search?query=hello");
});
