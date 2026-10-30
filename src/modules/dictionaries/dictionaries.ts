// URL construction stays independent of Raycast so it can be tested with Node.
export interface Dictionary {
  id: string;
  name: string;
  description: string;
  language: "English–English" | "English–Korean";
  homeUrl: string;
  searchPrefix: string;
}

export const dictionaries: readonly Dictionary[] = [
  {
    id: "cambridge",
    name: "Cambridge Dictionary",
    description: "Learner definitions and British / American pronunciation",
    language: "English–English",
    homeUrl: "https://dictionary.cambridge.org/dictionary/english/",
    searchPrefix: "https://dictionary.cambridge.org/search/english/direct/?q=",
  },
  {
    id: "oxford",
    name: "Oxford Learner's Dictionaries",
    description: "Definitions, examples and pronunciation",
    language: "English–English",
    homeUrl: "https://www.oxfordlearnersdictionaries.com/",
    searchPrefix: "https://www.oxfordlearnersdictionaries.com/search/english/?q=",
  },
  {
    id: "merriam-webster",
    name: "Merriam-Webster",
    description: "American English definitions and usage",
    language: "English–English",
    homeUrl: "https://www.merriam-webster.com/",
    searchPrefix: "https://www.merriam-webster.com/dictionary/",
  },
  {
    id: "collins",
    name: "Collins Dictionary",
    description: "English definitions and natural examples",
    language: "English–English",
    homeUrl: "https://www.collinsdictionary.com/dictionary/english",
    searchPrefix: "https://www.collinsdictionary.com/search/?dictCode=english&q=",
  },
  {
    id: "dictionary-com",
    name: "Dictionary.com",
    description: "Definitions, word origins and examples",
    language: "English–English",
    homeUrl: "https://www.dictionary.com/",
    searchPrefix: "https://www.dictionary.com/browse/",
  },
  {
    id: "naver",
    name: "Naver English Dictionary",
    description: "네이버 영어사전 · 영한 뜻과 예문",
    language: "English–Korean",
    homeUrl: "https://en.dict.naver.com/",
    searchPrefix: "https://en.dict.naver.com/#/search?query=",
  },
];

export function dictionaryUrl(dictionary: Dictionary, searchText: string): string {
  const query = searchText.trim();
  return query ? dictionary.searchPrefix + encodeURIComponent(query) : dictionary.homeUrl;
}
