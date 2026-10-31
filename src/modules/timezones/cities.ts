import { readFileSync } from "node:fs";

export interface City {
  id: string;
  name: string;
  timeZone: string;
  keywords: string[];
  countryCode?: string;
}

const COUNTRIES = {
  KR: ["한국", "대한민국", "Korea", "South Korea"],
  US: ["미국", "USA", "United States"],
  CA: ["캐나다", "Canada"],
  MX: ["멕시코", "Mexico"],
  BR: ["브라질", "Brazil"],
  AR: ["아르헨티나", "Argentina"],
  CL: ["칠레", "Chile"],
  PE: ["페루", "Peru"],
  CO: ["콜롬비아", "Colombia"],
  GB: ["영국", "UK", "United Kingdom"],
  FR: ["프랑스", "France"],
  DE: ["독일", "Germany"],
  IT: ["이탈리아", "Italy"],
  ES: ["스페인", "Spain"],
  PT: ["포르투갈", "Portugal"],
  NL: ["네덜란드", "Netherlands"],
  BE: ["벨기에", "Belgium"],
  CH: ["스위스", "Switzerland"],
  AT: ["오스트리아", "Austria"],
  CZ: ["체코", "Czechia"],
  PL: ["폴란드", "Poland"],
  SE: ["스웨덴", "Sweden"],
  DK: ["덴마크", "Denmark"],
  NO: ["노르웨이", "Norway"],
  FI: ["핀란드", "Finland"],
  IE: ["아일랜드", "Ireland"],
  GR: ["그리스", "Greece"],
  TR: ["튀르키예", "터키", "Turkey", "Türkiye"],
  RU: ["러시아", "Russia"],
  UA: ["우크라이나", "Ukraine"],
  HU: ["헝가리", "Hungary"],
  JP: ["일본", "Japan"],
  CN: ["중국", "China"],
  HK: ["홍콩", "Hong Kong"],
  MO: ["마카오", "Macau", "Macao"],
  TW: ["대만", "Taiwan"],
  SG: ["싱가포르", "Singapore"],
  TH: ["태국", "Thailand"],
  VN: ["베트남", "Vietnam"],
  PH: ["필리핀", "Philippines"],
  MY: ["말레이시아", "Malaysia"],
  ID: ["인도네시아", "Indonesia"],
  IN: ["인도", "India"],
  NP: ["네팔", "Nepal"],
  BD: ["방글라데시", "Bangladesh"],
  PK: ["파키스탄", "Pakistan"],
  LK: ["스리랑카", "Sri Lanka"],
  AE: ["아랍에미리트", "UAE", "United Arab Emirates"],
  QA: ["카타르", "Qatar"],
  SA: ["사우디아라비아", "Saudi Arabia"],
  IL: ["이스라엘", "Israel"],
  AU: ["호주", "오스트레일리아", "Australia"],
  NZ: ["뉴질랜드", "New Zealand"],
  EG: ["이집트", "Egypt"],
  ZA: ["남아공", "남아프리카공화국", "South Africa"],
  KE: ["케냐", "Kenya"],
  NG: ["나이지리아", "Nigeria"],
  MA: ["모로코", "Morocco"],
  GH: ["가나", "Ghana"],
} as const;

type CityRow = [id: string, name: string, korean: string, timeZone: string, country: keyof typeof COUNTRIES, aliases?: string[]];

// Bundled offline database. Cities sharing an IANA zone remain separate locations.
const CITY_ROWS: CityRow[] = [
  ["new-york", "New York", "뉴욕", "America/New_York", "US", ["NYC", "NY"]],
  ["seoul", "Seoul", "서울", "Asia/Seoul", "KR"],
  ["san-francisco", "San Francisco", "샌프란시스코", "America/Los_Angeles", "US", ["SF", "샌프란", "실리콘밸리"]],
  ["busan", "Busan", "부산", "Asia/Seoul", "KR", ["Pusan"]],
  ["incheon", "Incheon", "인천", "Asia/Seoul", "KR"],
  ["daegu", "Daegu", "대구", "Asia/Seoul", "KR"],
  ["daejeon", "Daejeon", "대전", "Asia/Seoul", "KR"],
  ["gwangju", "Gwangju", "광주", "Asia/Seoul", "KR"],
  ["suwon", "Suwon", "수원", "Asia/Seoul", "KR"],
  ["jeju", "Jeju", "제주", "Asia/Seoul", "KR"],
  ["los-angeles", "Los Angeles", "로스앤젤레스", "America/Los_Angeles", "US", ["LA", "엘에이"]],
  ["seattle", "Seattle", "시애틀", "America/Los_Angeles", "US"],
  ["san-jose", "San Jose", "산호세", "America/Los_Angeles", "US", ["Silicon Valley", "실리콘밸리"]],
  ["san-diego", "San Diego", "샌디에이고", "America/Los_Angeles", "US"],
  ["portland", "Portland", "포틀랜드", "America/Los_Angeles", "US", ["Oregon"]],
  ["las-vegas", "Las Vegas", "라스베이거스", "America/Los_Angeles", "US", ["라스베가스"]],
  ["phoenix", "Phoenix", "피닉스", "America/Phoenix", "US"],
  ["denver", "Denver", "덴버", "America/Denver", "US"],
  ["salt-lake-city", "Salt Lake City", "솔트레이크시티", "America/Denver", "US"],
  ["dallas", "Dallas", "댈러스", "America/Chicago", "US", ["달라스"]],
  ["austin", "Austin", "오스틴", "America/Chicago", "US"],
  ["houston", "Houston", "휴스턴", "America/Chicago", "US"],
  ["chicago", "Chicago", "시카고", "America/Chicago", "US"],
  ["detroit", "Detroit", "디트로이트", "America/Detroit", "US"],
  ["miami", "Miami", "마이애미", "America/New_York", "US"],
  ["atlanta", "Atlanta", "애틀랜타", "America/New_York", "US"],
  ["boston", "Boston", "보스턴", "America/New_York", "US"],
  ["washington-dc", "Washington DC", "워싱턴", "America/New_York", "US", ["Washington D.C.", "워싱턴 DC"]],
  ["philadelphia", "Philadelphia", "필라델피아", "America/New_York", "US"],
  ["honolulu", "Honolulu", "호놀룰루", "Pacific/Honolulu", "US", ["Hawaii", "하와이"]],
  ["anchorage", "Anchorage", "앵커리지", "America/Anchorage", "US", ["Alaska", "알래스카"]],
  ["vancouver", "Vancouver", "밴쿠버", "America/Vancouver", "CA"],
  ["toronto", "Toronto", "토론토", "America/Toronto", "CA"],
  ["montreal", "Montreal", "몬트리올", "America/Toronto", "CA"],
  ["ottawa", "Ottawa", "오타와", "America/Toronto", "CA"],
  ["calgary", "Calgary", "캘거리", "America/Edmonton", "CA"],
  ["mexico-city", "Mexico City", "멕시코시티", "America/Mexico_City", "MX"],
  ["guadalajara", "Guadalajara", "과달라하라", "America/Mexico_City", "MX"],
  ["monterrey", "Monterrey", "몬테레이", "America/Monterrey", "MX"],
  ["sao-paulo", "São Paulo", "상파울루", "America/Sao_Paulo", "BR", ["Sao Paulo"]],
  ["rio-de-janeiro", "Rio de Janeiro", "리우데자네이루", "America/Sao_Paulo", "BR", ["Rio"]],
  ["brasilia", "Brasilia", "브라질리아", "America/Sao_Paulo", "BR"],
  ["buenos-aires", "Buenos Aires", "부에노스아이레스", "America/Argentina/Buenos_Aires", "AR"],
  ["santiago", "Santiago", "산티아고", "America/Santiago", "CL"],
  ["lima", "Lima", "리마", "America/Lima", "PE"],
  ["bogota", "Bogota", "보고타", "America/Bogota", "CO"],
  ["london", "London", "런던", "Europe/London", "GB"],
  ["edinburgh", "Edinburgh", "에든버러", "Europe/London", "GB"],
  ["paris", "Paris", "파리", "Europe/Paris", "FR"],
  ["lyon", "Lyon", "리옹", "Europe/Paris", "FR"],
  ["berlin", "Berlin", "베를린", "Europe/Berlin", "DE"],
  ["frankfurt", "Frankfurt", "프랑크푸르트", "Europe/Berlin", "DE"],
  ["munich", "Munich", "뮌헨", "Europe/Berlin", "DE", ["München"]],
  ["hamburg", "Hamburg", "함부르크", "Europe/Berlin", "DE"],
  ["rome", "Rome", "로마", "Europe/Rome", "IT"],
  ["milan", "Milan", "밀라노", "Europe/Rome", "IT"],
  ["madrid", "Madrid", "마드리드", "Europe/Madrid", "ES"],
  ["barcelona", "Barcelona", "바르셀로나", "Europe/Madrid", "ES"],
  ["lisbon", "Lisbon", "리스본", "Europe/Lisbon", "PT"],
  ["amsterdam", "Amsterdam", "암스테르담", "Europe/Amsterdam", "NL"],
  ["brussels", "Brussels", "브뤼셀", "Europe/Brussels", "BE"],
  ["zurich", "Zurich", "취리히", "Europe/Zurich", "CH", ["Zürich"]],
  ["geneva", "Geneva", "제네바", "Europe/Zurich", "CH"],
  ["vienna", "Vienna", "빈", "Europe/Vienna", "AT", ["Wien", "비엔나"]],
  ["prague", "Prague", "프라하", "Europe/Prague", "CZ"],
  ["warsaw", "Warsaw", "바르샤바", "Europe/Warsaw", "PL"],
  ["stockholm", "Stockholm", "스톡홀름", "Europe/Stockholm", "SE"],
  ["copenhagen", "Copenhagen", "코펜하겐", "Europe/Copenhagen", "DK"],
  ["oslo", "Oslo", "오슬로", "Europe/Oslo", "NO"],
  ["helsinki", "Helsinki", "헬싱키", "Europe/Helsinki", "FI"],
  ["dublin", "Dublin", "더블린", "Europe/Dublin", "IE"],
  ["athens", "Athens", "아테네", "Europe/Athens", "GR"],
  ["istanbul", "Istanbul", "이스탄불", "Europe/Istanbul", "TR"],
  ["moscow", "Moscow", "모스크바", "Europe/Moscow", "RU"],
  ["kyiv", "Kyiv", "키이우", "Europe/Kyiv", "UA", ["Kiev", "키예프"]],
  ["budapest", "Budapest", "부다페스트", "Europe/Budapest", "HU"],
  ["tokyo", "Tokyo", "도쿄", "Asia/Tokyo", "JP", ["東京"]],
  ["osaka", "Osaka", "오사카", "Asia/Tokyo", "JP"],
  ["kyoto", "Kyoto", "교토", "Asia/Tokyo", "JP"],
  ["fukuoka", "Fukuoka", "후쿠오카", "Asia/Tokyo", "JP"],
  ["nagoya", "Nagoya", "나고야", "Asia/Tokyo", "JP"],
  ["beijing", "Beijing", "베이징", "Asia/Shanghai", "CN", ["북경", "Peking"]],
  ["shanghai", "Shanghai", "상하이", "Asia/Shanghai", "CN"],
  ["shenzhen", "Shenzhen", "선전", "Asia/Shanghai", "CN", ["심천"]],
  ["guangzhou", "Guangzhou", "광저우", "Asia/Shanghai", "CN", ["광주", "Canton"]],
  ["hong-kong", "Hong Kong", "홍콩", "Asia/Hong_Kong", "HK"],
  ["macau", "Macau", "마카오", "Asia/Macau", "MO"],
  ["taipei", "Taipei", "타이베이", "Asia/Taipei", "TW"],
  ["kaohsiung", "Kaohsiung", "가오슝", "Asia/Taipei", "TW"],
  ["singapore", "Singapore", "싱가포르", "Asia/Singapore", "SG"],
  ["bangkok", "Bangkok", "방콕", "Asia/Bangkok", "TH"],
  ["chiang-mai", "Chiang Mai", "치앙마이", "Asia/Bangkok", "TH"],
  ["ho-chi-minh", "Ho Chi Minh City", "호치민", "Asia/Ho_Chi_Minh", "VN", ["Saigon", "사이공"]],
  ["hanoi", "Hanoi", "하노이", "Asia/Ho_Chi_Minh", "VN"],
  ["da-nang", "Da Nang", "다낭", "Asia/Ho_Chi_Minh", "VN"],
  ["manila", "Manila", "마닐라", "Asia/Manila", "PH"],
  ["cebu", "Cebu", "세부", "Asia/Manila", "PH"],
  ["kuala-lumpur", "Kuala Lumpur", "쿠알라룸푸르", "Asia/Kuala_Lumpur", "MY", ["KL"]],
  ["jakarta", "Jakarta", "자카르타", "Asia/Jakarta", "ID"],
  ["bali", "Bali", "발리", "Asia/Makassar", "ID", ["Denpasar", "덴파사르"]],
  ["mumbai", "Mumbai", "뭄바이", "Asia/Kolkata", "IN", ["Bombay", "봄베이"]],
  ["new-delhi", "New Delhi", "뉴델리", "Asia/Kolkata", "IN", ["Delhi", "델리"]],
  ["bengaluru", "Bengaluru", "벵갈루루", "Asia/Kolkata", "IN", ["방갈로르", "Bangalore"]],
  ["hyderabad", "Hyderabad", "하이데라바드", "Asia/Kolkata", "IN"],
  ["chennai", "Chennai", "첸나이", "Asia/Kolkata", "IN"],
  ["pune", "Pune", "푸네", "Asia/Kolkata", "IN"],
  ["kathmandu", "Kathmandu", "카트만두", "Asia/Kathmandu", "NP"],
  ["dhaka", "Dhaka", "다카", "Asia/Dhaka", "BD"],
  ["karachi", "Karachi", "카라치", "Asia/Karachi", "PK"],
  ["colombo", "Colombo", "콜롬보", "Asia/Colombo", "LK"],
  ["dubai", "Dubai", "두바이", "Asia/Dubai", "AE"],
  ["abu-dhabi", "Abu Dhabi", "아부다비", "Asia/Dubai", "AE"],
  ["doha", "Doha", "도하", "Asia/Qatar", "QA"],
  ["riyadh", "Riyadh", "리야드", "Asia/Riyadh", "SA"],
  ["tel-aviv", "Tel Aviv", "텔아비브", "Asia/Jerusalem", "IL"],
  ["jerusalem", "Jerusalem", "예루살렘", "Asia/Jerusalem", "IL"],
  ["sydney", "Sydney", "시드니", "Australia/Sydney", "AU"],
  ["melbourne", "Melbourne", "멜버른", "Australia/Melbourne", "AU"],
  ["brisbane", "Brisbane", "브리즈번", "Australia/Brisbane", "AU"],
  ["perth", "Perth", "퍼스", "Australia/Perth", "AU"],
  ["adelaide", "Adelaide", "애들레이드", "Australia/Adelaide", "AU"],
  ["darwin", "Darwin", "다윈", "Australia/Darwin", "AU"],
  ["canberra", "Canberra", "캔버라", "Australia/Sydney", "AU"],
  ["hobart", "Hobart", "호바트", "Australia/Hobart", "AU"],
  ["auckland", "Auckland", "오클랜드", "Pacific/Auckland", "NZ"],
  ["wellington", "Wellington", "웰링턴", "Pacific/Auckland", "NZ"],
  ["christchurch", "Christchurch", "크라이스트처치", "Pacific/Auckland", "NZ"],
  ["cairo", "Cairo", "카이로", "Africa/Cairo", "EG"],
  ["johannesburg", "Johannesburg", "요하네스버그", "Africa/Johannesburg", "ZA"],
  ["cape-town", "Cape Town", "케이프타운", "Africa/Johannesburg", "ZA"],
  ["nairobi", "Nairobi", "나이로비", "Africa/Nairobi", "KE"],
  ["lagos", "Lagos", "라고스", "Africa/Lagos", "NG"],
  ["casablanca", "Casablanca", "카사블랑카", "Africa/Casablanca", "MA"],
  ["accra", "Accra", "아크라", "Africa/Accra", "GH"],
];

export const CITY_DATABASE: City[] = CITY_ROWS.map(([id, name, korean, timeZone, country, aliases = []]) => ({
  id, name, timeZone, countryCode: country, keywords: [korean, country, ...COUNTRIES[country], ...aliases],
}));
CITY_DATABASE.push({ id: "utc", name: "UTC", timeZone: "UTC", keywords: ["협정 세계시", "Coordinated Universal Time", "GMT", "그리니치 표준시"] });
export const DEFAULT_CITIES = CITY_DATABASE.slice(0, 3);

// Abbreviations are search aliases, never fixed-offset conversion rules.
const TIME_ZONE_NAMES: [zones: string[], names: string[]][] = [
  [["Asia/Seoul"], ["KST", "Korea Standard Time", "한국 표준시", "한국 시간"]],
  [["Asia/Tokyo"], ["JST", "Japan Standard Time", "일본 표준시"]],
  [["America/New_York", "America/Detroit", "America/Toronto"], ["ET", "EST", "EDT", "Eastern Time", "Eastern Standard Time", "Eastern Daylight Time", "미국 동부", "동부 표준시"]],
  [["America/Los_Angeles", "America/Vancouver"], ["PT", "PST", "PDT", "Pacific Time", "Pacific Standard Time", "Pacific Daylight Time", "미국 서부", "태평양 표준시"]],
  [["America/Chicago"], ["CT", "CST", "CDT", "Central Time", "Central Standard Time", "Central Daylight Time", "미국 중부", "중부 표준시"]],
  [["America/Denver", "America/Edmonton"], ["MT", "MST", "MDT", "Mountain Time", "Mountain Standard Time", "Mountain Daylight Time", "미국 산악"]],
  [["America/Phoenix"], ["MST", "Mountain Standard Time", "산악 표준시"]],
  [["Pacific/Honolulu"], ["HST", "Hawaii Standard Time", "하와이 표준시"]],
  [["America/Anchorage"], ["AKST", "AKDT", "Alaska Time", "알래스카 시간"]],
  [["Europe/London"], ["GMT", "BST", "British Time", "British Summer Time", "Greenwich Mean Time", "영국 시간", "영국 표준시"]],
  [["Europe/Paris", "Europe/Berlin", "Europe/Rome", "Europe/Madrid", "Europe/Amsterdam", "Europe/Brussels", "Europe/Zurich", "Europe/Vienna", "Europe/Prague", "Europe/Warsaw", "Europe/Stockholm", "Europe/Copenhagen", "Europe/Oslo", "Europe/Budapest"], ["CET", "CEST", "Central European Time", "Central European Standard Time", "Central European Summer Time", "중앙 유럽 시간", "중부 유럽 표준시"]],
  [["Europe/Helsinki", "Europe/Athens", "Europe/Kyiv"], ["EET", "EEST", "Eastern European Time", "Eastern European Summer Time", "동유럽 표준시"]],
  [["Europe/Lisbon"], ["WET", "WEST", "Western European Time", "서유럽 표준시"]],
  [["Europe/Dublin"], ["GMT", "IST", "Irish Standard Time", "아일랜드 표준시"]],
  [["Europe/Istanbul"], ["TRT", "Turkey Time", "튀르키예 시간"]],
  [["Europe/Moscow"], ["MSK", "Moscow Standard Time", "모스크바 표준시"]],
  [["Asia/Shanghai", "Asia/Hong_Kong", "Asia/Macau", "Asia/Taipei"], ["CST", "China Standard Time", "중국 표준시"]],
  [["Asia/Hong_Kong"], ["HKT", "Hong Kong Time", "홍콩 시간"]],
  [["Asia/Singapore"], ["SGT", "Singapore Time", "Singapore Standard Time", "싱가포르 표준시"]],
  [["Asia/Bangkok", "Asia/Ho_Chi_Minh"], ["ICT", "Indochina Time", "인도차이나 시간"]],
  [["Asia/Manila"], ["PHT", "Philippine Time", "필리핀 표준시"]],
  [["Asia/Kuala_Lumpur"], ["MYT", "Malaysia Time", "말레이시아 표준시"]],
  [["Asia/Jakarta"], ["WIB", "Western Indonesia Time", "서부 인도네시아 시간"]],
  [["Asia/Makassar"], ["WITA", "Central Indonesia Time", "중부 인도네시아 시간"]],
  [["Asia/Kolkata", "Asia/Colombo"], ["IST", "India Standard Time", "Indian Standard Time", "인도 표준시"]],
  [["Asia/Kathmandu"], ["NPT", "Nepal Time", "네팔 표준시"]],
  [["Asia/Dhaka"], ["BST", "Bangladesh Standard Time", "방글라데시 표준시"]],
  [["Asia/Karachi"], ["PKT", "Pakistan Standard Time", "파키스탄 표준시"]],
  [["Asia/Dubai"], ["GST", "Gulf Standard Time", "걸프 표준시"]],
  [["Asia/Qatar", "Asia/Riyadh"], ["AST", "Arabia Standard Time", "아라비아 표준시"]],
  [["Asia/Jerusalem"], ["IST", "IDT", "Israel Standard Time", "Israel Daylight Time", "이스라엘 표준시"]],
  [["Australia/Sydney", "Australia/Melbourne", "Australia/Hobart"], ["AEST", "AEDT", "Australian Eastern Time", "Australian Eastern Standard Time", "Australian Eastern Daylight Time", "호주 동부 표준시"]],
  [["Australia/Brisbane"], ["AEST", "Australian Eastern Standard Time", "호주 동부 표준시"]],
  [["Australia/Adelaide"], ["ACST", "ACDT", "Australian Central Time", "Australian Central Standard Time", "Australian Central Daylight Time", "호주 중부 표준시"]],
  [["Australia/Darwin"], ["ACST", "Australian Central Standard Time", "호주 중부 표준시"]],
  [["Australia/Perth"], ["AWST", "Australian Western Standard Time", "호주 서부 표준시"]],
  [["Pacific/Auckland"], ["NZST", "NZDT", "New Zealand Time", "New Zealand Standard Time", "New Zealand Daylight Time", "뉴질랜드 표준시"]],
  [["America/Sao_Paulo"], ["BRT", "Brasilia Time", "브라질리아 시간"]],
  [["Africa/Johannesburg"], ["SAST", "South Africa Standard Time", "남아프리카 표준시"]],
  [["Africa/Nairobi"], ["EAT", "East Africa Time", "동아프리카 시간"]],
  [["Africa/Lagos"], ["WAT", "West Africa Time", "서아프리카 시간"]],
  [["UTC"], ["UTC", "GMT", "Coordinated Universal Time", "협정 세계시", "그리니치 표준시"]],
];

const canonicalZones = new Map<string, string>();
function canonicalZone(timeZone: string): string {
  let canonical = canonicalZones.get(timeZone);
  if (!canonical) {
    canonical = new Intl.DateTimeFormat("en", { timeZone }).resolvedOptions().timeZone;
    canonicalZones.set(timeZone, canonical);
  }
  return canonical;
}

const countriesByZone = new Map(CITY_DATABASE.flatMap((city) => city.countryCode ? [[city.timeZone, city.countryCode] as const] : []));
try {
  // macOS ships this public-domain IANA table. Keep the bundled city metadata as a fallback.
  for (const line of readFileSync("/usr/share/zoneinfo/zone.tab", "utf8").split("\n")) {
    const [country, , zone] = line.split("\t");
    if (/^[A-Z]{2}$/.test(country) && zone) countriesByZone.set(zone, country);
  }
} catch {
  // Unknown regions use a globe instead of guessing a country's flag.
}
const canonicalCountries = new Map<string, string | undefined>();
for (const [zone, country] of countriesByZone) {
  try {
    const canonical = canonicalZone(zone);
    canonicalCountries.set(canonical, canonicalCountries.has(canonical) && canonicalCountries.get(canonical) !== country ? undefined : country);
  } catch {
    // The system table can contain zones newer than the JavaScript runtime.
  }
}
const knownCountries = new Set(countriesByZone.values());

function countryForZone(timeZone: string): string | undefined {
  return countriesByZone.get(timeZone) ?? canonicalCountries.get(canonicalZone(timeZone));
}

const zoneNames = new Map<string, string[]>();
for (const [zones, names] of TIME_ZONE_NAMES) {
  for (const zone of zones) {
    const canonical = canonicalZone(zone);
    zoneNames.set(canonical, [...(zoneNames.get(canonical) ?? []), ...names]);
  }
}

export function timeZoneNames(timeZone: string): string[] {
  return zoneNames.get(canonicalZone(timeZone)) ?? [];
}

export function timeZoneDescription(timeZone: string): string {
  return timeZoneNames(timeZone).filter((name) => /^[\x20-\x7e]+$/.test(name)).join(" · ") || timeZone;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function cityCatalog(): City[] {
  const cities = [...CITY_DATABASE];
  for (const timeZone of Intl.supportedValuesOf("timeZone")) {
    const name = timeZone.split("/").at(-1)!.replaceAll("_", " ");
    if (cities.some((city) => normalize(city.name) === normalize(name) && canonicalZone(city.timeZone) === canonicalZone(timeZone))) continue;
    const countryCode = countryForZone(timeZone);
    cities.push({
      id: `zone:${timeZone}`, name, timeZone, keywords: timeZone.split("/"),
      ...(countryCode ? { countryCode } : {}),
    });
  }
  return cities.sort((a, b) => a.name.localeCompare(b.name, "en"));
}

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[_/.,-]+/g, " ").replace(/\s+/g, " ").trim();
}

const CATALOG = cityCatalog();
const databaseById = new Map(CITY_DATABASE.map((city) => [city.id, city]));
const searchFields = new Map<string, string[]>();
const abbreviations = new Set(TIME_ZONE_NAMES.flatMap(([, names]) => names.filter((name) => /^[A-Z]{2,4}$/.test(name)).map(normalize)));

export function countryFlag(city: City): string {
  const savedCode = city.countryCode && knownCountries.has(city.countryCode) ? city.countryCode : undefined;
  const databaseCity = databaseById.get(city.id);
  const databaseCode = databaseCity && canonicalZone(databaseCity.timeZone) === canonicalZone(city.timeZone)
    ? databaseCity.countryCode : undefined;
  const code = savedCode ?? databaseCode ?? countryForZone(city.timeZone);
  return code ? String.fromCodePoint(...[...code].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65)) : "🌐";
}

function fields(city: City): string[] {
  const databaseCity = databaseById.get(city.id);
  return [
    city.name, city.timeZone, ...city.keywords, ...timeZoneNames(city.timeZone),
    ...(databaseCity?.timeZone === city.timeZone ? databaseCity.keywords : []),
  ].map(normalize);
}

for (const city of CATALOG) searchFields.set(city.id, fields(city));

export function searchCities(query: string, cities: City[] = CATALOG): City[] {
  const normalized = normalize(query);
  if (!normalized) return [...cities];
  const terms = normalized.split(" ");
  return cities.map((city) => {
    const words = cities === CATALOG ? searchFields.get(city.id)! : fields(city);
    if (abbreviations.has(normalized) && !words.includes(normalized)) return undefined;
    if (!terms.every((term) => words.some((word) => word.includes(term)))) return undefined;
    const name = normalize(city.name);
    const rank = name === normalized ? 0 : words.includes(normalized) ? 1 : name.startsWith(normalized) ? 2 : 3;
    return { city, rank };
  }).filter((item) => item !== undefined)
    .sort((a, b) => a.rank - b.rank || Number(a.city.id.startsWith("zone:")) - Number(b.city.id.startsWith("zone:")) || a.city.name.localeCompare(b.city.name, "en"))
    .map(({ city }) => city);
}

export function sameCity(a: City, b: City): boolean {
  return a.id === b.id || (normalize(a.name) === normalize(b.name) && canonicalZone(a.timeZone) === canonicalZone(b.timeZone));
}

export function citySearchResults(cities: City[], query: string) {
  return {
    registered: query.trim() ? searchCities(query, cities) : cities,
    available: query.trim() ? searchCities(query).filter((city) => !cities.some((saved) => sameCity(city, saved))) : [],
  };
}

export type CityChange =
  | { type: "add"; city: City }
  | { type: "replace"; id: string; city: City }
  | { type: "remove"; id: string };

export function changeCityList(cities: City[], change: CityChange): City[] {
  if (change.type === "add") {
    if (cities.some((city) => sameCity(city, change.city))) throw new Error("This city is already in your list.");
    return [...cities, change.city];
  }
  const index = cities.findIndex(({ id }) => id === change.id);
  if (index === -1) throw new Error("This city is no longer in your list. Please check the list and try again.");
  if (change.type === "remove") return cities.filter((_, i) => i !== index);
  if (cities.some((city, i) => i !== index && sameCity(city, change.city))) throw new Error("This city is already in your list.");
  return cities.map((city, i) => i === index ? change.city : city);
}

export function customCity(name: string, timeZone: string): City {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 80 || /[\p{Cc}\p{Cf}]/u.test(trimmed)) {
    throw new Error("Enter a city name between 1 and 80 characters, without control characters.");
  }
  if (!isValidTimeZone(timeZone)) throw new Error("Select a valid IANA time zone.");
  return { id: `custom:${encodeURIComponent(trimmed.toLowerCase())}:${timeZone}`, name: trimmed, timeZone, keywords: [] };
}

export function parseSavedCities(raw: string | undefined): City[] | undefined {
  if (raw === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return undefined;
    const seen = new Set<string>();
    const cities: City[] = [];
    for (const item of parsed) {
      if (
        typeof item !== "object" || item === null ||
        typeof item.id !== "string" || !item.id || seen.has(item.id) ||
        typeof item.name !== "string" || typeof item.timeZone !== "string"
      ) return undefined;
      const validated = customCity(item.name, item.timeZone);
      seen.add(item.id);
      cities.push({
        ...validated,
        id: item.id,
        keywords: Array.isArray(item.keywords) ? item.keywords.filter((word: unknown): word is string => typeof word === "string") : [],
        ...(typeof item.countryCode === "string" && knownCountries.has(item.countryCode) ? { countryCode: item.countryCode } : {}),
      });
    }
    return cities;
  } catch {
    return undefined;
  }
}
