# raycast-tools

Personal Raycast tools, migrated from Alfred workflows.
The repository is **one Raycast extension** ("Lesstif Tools"). Each module adds one or more **commands**.
You run setup once on each Mac, no matter how many modules there are.

## Modules

| Module | Command | Description | Needs |
| --- | --- | --- | --- |
| `audio` | Switch Audio Device | Select an attached device and switch output + input together. Devices in use are at the bottom. | `switchaudio-osx` |
| `currency` | Convert Currency | Type an amount in the search bar: `1.3M`, `100k usd`, `$100k to krw`, `5000 won in usd`, `usd to krw`. Letters k/M/B/T, words like `million`, `bn`, and Korean units (`100만원`, `1억 5천만`, which mean KRW unless a currency is given) are understood. Copy, paste, or swap the result. | Network. Rates from [open.er-api.com](https://www.exchangerate-api.com) (free, daily), cached locally. |
| `exchange-rates` | Browse Exchange Rates | Browse USD, EUR, JPY, CNY, and GBP prices in KRW with 1-month, 3-month, and 1-year trend charts. JPY is quoted per 100 yen. | Network. Free ECB daily reference rates via [Frankfurter](https://frankfurter.dev/), no API key. Saved rates work offline. |
| `timezones` | Convert Time Zones | Compare linked city times with calendar/clock pickers, country flags, `City(Timezone)` labels, business-hour faces, and a bottom delete button in Delete Cities view. | Offline. Uses the runtime's IANA time-zone data; no API key or extra packages. |
| `wifi` | Switch Wi-Fi | Known networks in range: 5 GHz (and 6 GHz) first, then strongest signal; the current network is at the bottom. ↵ connects. On the current network, ↵ reconnects so macOS picks the strongest AP (for two APs with the same SSID). See [Wi-Fi notes](#wi-fi-notes). | Xcode Command Line Tools (builds `native/wifi-helper.swift`) |
| `dictionaries` | Search Dictionaries | Type an English word or phrase, choose Cambridge / Oxford / Merriam-Webster / Collins / Dictionary.com (English–English) or Naver (English–Korean), then press Enter to open the browser. | Browser and internet access; no API key or extra packages. |

Script Commands (bash, no build step) are in [`script-commands/`](script-commands/).

| Script | Description |
| --- | --- |
| `toggle-audio.sh` | Toggle output + input between a USB headset and the built-in devices (fixed keyword, no list) |

## Set up a Mac

Requirements: Homebrew, Node.js 22.22.2 or later, Xcode Command Line Tools (`xcode-select --install`).

```
git clone <remote-url> ~/github/raycast-tools
cd ~/github/raycast-tools
./setup.sh
```

`setup.sh` installs the Brewfile packages, builds `native/*.swift` into `assets/`, runs `npm install`, checks types, and runs `npm run dev`.
When Raycast shows "Lesstif Tools", press Ctrl+C. The extension stays in Raycast.

After `git pull`, run `./setup.sh` again to register new or changed commands.

To use the Script Commands: Raycast Settings → Extensions → **+** → Add Script Directory → select `script-commands/`.

## Structure

```
raycast-tools/
├── package.json            # Extension manifest: one entry in "commands" per command
├── Brewfile                # Homebrew packages that the modules need
├── setup.sh                # Set up one Mac
├── assets/                 # Icons, and native helpers built by setup.sh (not in Git)
├── native/                 # Swift sources for native helpers (one file = one binary)
├── src/
│   ├── <command-name>.tsx  # Command entry point (one line: export the module UI)
│   ├── lib/                # Shared helpers for all modules
│   │   └── exec.ts         # findBinary(), run()
│   └── modules/
│       └── <module>/       # One folder for each module
│           ├── *.ts        # Logic (no Raycast UI imports, easy to test)
│           └── *.tsx       # UI
└── script-commands/        # Raycast Script Commands (bash)
```

## Add a module

1. Make the folder `src/modules/<module>/` and put the logic and UI there.
2. Make the entry file `src/<command-name>.tsx`. Raycast finds a command by this file name.
   ```ts
   export { default } from "./modules/<module>/<Component>";
   ```
3. Add the command to `"commands"` in `package.json`. The `name` must match the entry file name.
   Put command-specific settings in that command's `"preferences"`.
4. If the module needs a Homebrew package, add it to `Brewfile`.
   If it needs a macOS API that has no command, add `native/<name>.swift`. setup.sh builds it to `assets/<name>`;
   find it at run time with `environment.assetsPath`. Add `assets/<name>` to `.gitignore`.
5. Add a row to the Modules table in this file.
6. Run `npm run dev` and test the command.

Rules:
- Modules do not import from other modules. Put shared code in `src/lib/`.
- Use `findBinary()` from `src/lib/exec.ts` for command-line tools. Raycast does not load the shell PATH.

### Command Icons

Each command has a separate 512 × 512 PNG: headphones for audio, a dollar/circular arrow for
currency conversion, a chart for exchange rates, a globe/clock for time zones, Wi-Fi waves,
and a book for dictionaries. The extension itself uses a tools icon.
The icons are bundled in `assets/` and require no downloads at runtime.
To regenerate them on macOS, run `swift scripts/generate-command-icons.swift "$PWD"` from
the repository root. Validate the manifest references and image sizes with `npm run test:icons`.
Run `npm run dev` again to register changed command icons in Raycast.

## Wi-Fi notes

- **Why a Swift helper.** macOS 14.4 removed the `airport` command. Only the CoreWLAN API can scan.
- **Location Services decide what you see.** Since macOS 14, a process without Location permission gets
  no SSID from CoreWLAN. The helper asks for the permission; macOS attributes it to **Raycast**.
  - **Granted:** one scan (about 5 s) lists every known network in range, and the current network is exact.
  - **Not granted:** the command scans each known network *by name* (that still reports signal and channel),
    about 5 s per network. Set **Networks** in the command preferences (example: `Home-Room_5G, Home-Living_5G`)
    so only the networks you switch between are scanned. The last result is shown at once, tagged `cached`.
  - To grant it later: System Settings → Privacy & Security → Location Services → Raycast.
- **Which network is current.** Without Location, macOS hides the current SSID too. The command tries
  `ipconfig getsummary` (shows it after a one-time `sudo ipconfig setverbose 1`). Otherwise it matches by
  channel and signal and shows **Connected?**.
- **Connect reports a false error.** On macOS 15+ a join of a saved network returns error `-3900 tmpErr`
  even when it works (the API cannot confirm the hidden SSID). `wifi-helper join` ignores that error and
  instead waits (up to 15 s) until the interface is on the target SSID or on one of its channels.
  Joining the network you are already on would drop the link, so that case is a no-op.
- **Same SSID on both APs.** You cannot choose an AP by name. Use **Reconnect (Strongest AP)** (⌘⇧R):
  Wi-Fi turns off and on, then joins the SSID, and macOS picks the strongest AP.
  The list shows `Stronger AP +N dB` when another AP of the current SSID is much stronger.
- **Connect uses the keychain.** The saved password is used. If a join fails every time for one network
  (the router refuses, or the password changed), connect once from the Wi-Fi menu to save it again.

## Browse Exchange Rates

Run `npm run dev` to register the new command, then open **Browse Exchange Rates** in Raycast.
It is part of **Lesstif Tools**, alongside the existing Convert Currency command.

- Select USD (US dollar), EUR (euro), JPY (Japanese yen), CNY (Chinese yuan), or GBP (British pound).
- The list and chart show **KRW per 1 foreign currency unit**, except **JPY per 100 yen**, following the usual Korean quote convention. The yen detail also shows the price of one yen.
- Use the **Trend Period** dropdown for 1 Month (30 days), 3 Months (90 days), or 1 Year (365 days).
- The detail shows the latest published price and date, a trend chart, period high/low, period change, and change since the previous publication.
- An upward chart means the foreign currency costs more won, not that KRW is strengthening.
- Press **⌘C** to copy the selected exchange rate, or **⌘R** to refresh.

Rates come from the European Central Bank through Frankfurter. They are **daily reference rates, not live prices or bank buy/sell quotes**.
Weekends and ECB holidays use the most recent publication; its date is always displayed.
The command loads a year of history in one request, caches it for one hour, and switches chart periods locally.
If a refresh fails, saved rates and charts remain visible with a warning and their original reference date.
Charts are generated locally, without a third-party chart service or extra packages.
The existing currency converter uses a different daily rate source, so its rates can differ slightly.

Validate with `npm run test:exchange-rates`, `npm run typecheck`, and `npm run build`.
In Raycast, manually check all five currencies, each chart period, search, copy, refresh, and the saved-data warning after disconnecting from the network.

## Convert Time Zones

Run `npm run dev`, then open **Convert Time Zones** in Raycast.
It is part of Lesstif Tools; the other commands remain available.
The interface, weekday names, validation messages, and copied times use English.
Korean search aliases and user-provided city names are still supported.

### Compare and Edit Times

1. The default cities are **New York, Seoul, and San Francisco**.
2. Search the entire offline database directly from the main search bar.
   Search by English or Korean city/country names (`London`, `런던`, `부산`),
   abbreviations (`KST`, `PST`), full time-zone names (`Pacific Standard Time`),
   or IANA names (`Asia/Tokyo`).
3. Select a result under **City and Time-Zone Results** and press **Enter** to add it.
   Use **⌘N** or the **Add or Search Cities** action to browse the database.
   **Add a Custom City** lets you provide a name and select its IANA time zone.
4. In **Compare Times**, select a saved city and press **Enter** to open the clock editor directly.
   The list header always shows **↵ Edit Time · ⌘D Edit Date**, including while searching.
   Use the **Hour (24-hour)** / **Minute** dropdowns, without typing or visiting the calendar first.
   **Edit City** switches which city's local time you are changing, without changing the shared instant.
   All city previews and business-hour indicators update as soon as the selection is valid.
5. Click **Apply Times to All Cities** (or **⌘↵**) to apply, or **Esc** to cancel.
6. To change only the date, select a saved city in the main list and press **⌘D** or use **Edit Date**.
   A **monthly calendar** opens, with seven columns from Sunday to Saturday.
   Click the compact **Previous** / **Next** controls once (or use **⌘←** / **⌘→**) and **Today** to navigate.
   **Selected Date**, immediately beside **Next**, shows the highlighted month/day and year.
   The fixed month/year dropdown also offers **Previous Month**, **Next Month**, **Today**, and year selection.
   Only the weeks needed by each month are shown. Initial focus stays on the top-row **Selected Date**
   card so opening the calendar or changing months does not scroll the navigation out of view.
   Select a day, then click **Choose Date** or press Enter to apply it and return directly to the list.
   The selected city's hour and minute are preserved; all other cities update to the same instant.
   Esc cancels without changes. A DST gap is rejected; a repeated time offers explicit earlier/later choices.
   Within the clock editor, **Date → Open Monthly Calendar…** or **⌘D** changes the draft date instead;
   returning from that calendar still requires **Apply Times to All Cities** to commit the draft.

Native Raycast lists cannot give the date and time text inside one row separate click handlers.
City rows therefore stay as one row, with visible Enter/⌘D guidance instead of pretending those labels are buttons.

The calendar date and clock selections use the selected city's time zone, not your Mac's.
Calendar days use UTC-only date arithmetic, separate from the clock, so the Mac's DST
transitions cannot silently shift another city's chosen time. The calendar uses native Raycast
Grid items and locally generated, theme-aware day images; no browser or calendar permissions are needed.
Blue marks the highlighted date and a teal outline marks today in the edited city's time zone.

City rows show a flag and **City(Timezone)**, for example **🇰🇷 Seoul(KST)**,
**🇮🇩 Jakarta(WIB)**, or **🇵🇭 Manila(PHT)**.
The displayed abbreviation follows the selected date, such as **New York(EST)** in winter
and **New York(EDT)** during daylight saving time.
Each row also shows the local date, English weekday, time, UTC offset, and business-hour face.
Known cities use bundled country codes. Other regions use macOS's public-domain IANA
`/usr/share/zoneinfo/zone.tab` country table when available.
UTC and regions with no known country use a globe instead of an invented flag.
Previously saved city lists do not need to be reset to show flags.

**⌘C** copies one city's time; **⌘⇧C** copies every city.
The action menu also offers **One Hour Earlier** and **One Hour Later**.

### Add, Replace, and Delete Cities

- **Add:** Search on the main screen and press Enter, or use **⌘N** / the **Add or Search Cities** action.
- **Replace:** Select a saved city and press **⌘E**. In the **Manage Cities** view,
  Enter opens the replacement picker. Choose another city, or use **Edit Name and Time Zone**.
  Replacement preserves the city's position, all other saved cities, and the selected instant.
- **Delete with a click:** Select **Delete Cities** in the view dropdown, select a saved city,
  then click **Delete City** in Raycast's bottom bar. You do not need to open the action menu.
  Deletion affects only that selected city and saves immediately; Enter also triggers the button.
  Select **Compare Times** in the dropdown to return to editing.
  City rows keep their flags, without decorative trash icons that look like buttons.
  In other views, **⌘⇧D** and the **Delete City** action remain available.
  Raycast exposes one primary bottom-bar button, so it shows **Edit Time** in Compare Times
  and **Delete City** in Delete Cities, rather than two independent permanent buttons.
- The list shows only cities and search results, without a separate **City Controls** section.
  Controls remain available in the action menu and through keyboard shortcuts.
- Changes are saved automatically. You can remove every city and still search/add new ones.
  Different cities sharing the same time zone can be saved together.

The bundled city, country, and alias database lives in `src/modules/timezones/cities.ts`
(`CITY_ROWS` and `TIME_ZONE_NAMES`), supplemented by the runtime's full IANA region list.
Ambiguous abbreviations such as `IST` and `CST` can return multiple countries.
Check the IANA name before adding; conversion always uses that region's date-specific rules,
not a fixed offset inferred from a search alias.

City selections persist on this Mac. The command starts at the current time and updates automatically.
Editing a time freezes the comparison at that instant. **⌘R** restores current time and automatic updates.
The selected instant itself is not saved.

### Business Hours and Daylight Saving

- Business hours default to **Monday-Friday, 09:00 inclusive to 18:00 exclusive**, in each city's local time.
- **🙂 Working Hours:** within the configured working schedule.
- **😐 Non-Working Hours:** outside the working schedule, but not sleeping hours (including daytime weekends by default).
- **☹️ Sleeping Hours:** **00:00 inclusive to 07:00 exclusive**, every day in each city's local time.
  Sleeping hours take priority if the working schedule overlaps them.
- Hover over a face in saved-city rows or search results to see the state, local date/time,
  IANA time zone, working schedule, and sleeping-hour rule. Editor previews and copied comparisons use the same faces.
- **Configure Business Hours (⌘,)** changes the shared local start/end time and weekend setting.
  `24:00` is allowed as the end time. Overnight schedules and public holidays are not supported.
- Conversion handles date boundaries, regional DST rules, and half-hour/quarter-hour offsets.
- A skipped local time produces an error instead of silently moving the time.
  For a repeated local time, use **Repeated Local Time** to choose **Earlier** or **Later**.
  An invalid selection leaves the previews at the last valid instant and cannot be applied.
- Input years range from **1900 to 2100**. Rules come from the runtime's IANA database;
  a Raycast runtime update may be needed after governments change time-zone rules.

### Validation

```sh
npm run test:timezones
npm run typecheck
npm run build
```

Tests cover monthly grids, leap years, month/year navigation, supported-year limits,
calendar/clock selections across Mac time zones, database search, saved-list changes, duplicate prevention, flag metadata,
English UI strings, date-specific abbreviations, date boundaries, leap years,
skipped/repeated local times, half-hour DST changes, working/non-working/sleeping boundaries, tooltips, and copying times.
In Raycast, manually check flags and labels, selecting a row and clicking the bottom **Delete City** button,
all three views, face tooltips on saved cities and search results, search/add/replace, persistence, month navigation and date selection, clock editing, DST selection,
cancel, copy, and resetting to the current time.

## Search Dictionaries

기존 **Lesstif Tools** 확장에 포함된 명령입니다. 별도 확장 생성이나 Homebrew 패키지 추가는 필요하지 않습니다.

### 설치 및 실행

Raycast와 Node.js 22.22.2 이상이 필요합니다. 새 Mac에서 기존 모듈까지 모두 설정하려면 위의 `./setup.sh`를 사용하세요.
이미 이 프로젝트를 사용 중이거나 사전 명령을 먼저 등록하려면 다음만 실행하세요.

```sh
cd ~/github/raycast-tools
npm install
npm run typecheck
npm run test:dictionaries
npm run build
npm run dev
```

`npm run dev`가 확장을 Raycast에 등록하면 **Search Dictionaries**를 실행하세요.
등록 후 개발 중에는 터미널을 열어 두면 수정 사항이 반영됩니다. 완료 후 Ctrl+C로 개발 감시를 종료할 수 있습니다.
등록되지 않으면 Raycast의 **Import Extension**에서 이 프로젝트 폴더를 선택한 뒤 다시 실행하세요.
단축키나 별칭은 Raycast Settings → Extensions → Lesstif Tools → Search Dictionaries에서 설정할 수 있습니다.

### 사용 방법

1. Raycast에서 **Search Dictionaries**를 엽니다.
2. 검색창에 `incumbent` 같은 단어나 `take into account` 같은 표현을 입력합니다.
3. ↑/↓로 사전을 고른 뒤 Enter를 누릅니다. 기본 브라우저에 선택한 사전의 검색 페이지가 열립니다.
4. ⌘C로 현재 선택한 사전의 검색 URL을 복사할 수 있습니다.

입력한 단어로 사전 목록을 필터링하지 않으므로 여섯 사전이 항상 표시됩니다.
앞뒤 공백은 제거하고 공백·특수문자·한글은 URL에 맞게 인코딩합니다.
빈 입력이나 공백만 있는 경우 Enter는 해당 사전의 홈페이지를 엽니다.
영영사전 다섯 곳과 네이버 영한사전은 목록의 언어 표시로 구분합니다.
검색어는 브라우저를 열 때 선택한 사전으로 전달되며, 확장 자체는 검색 이력을 저장하지 않습니다.
구문·숙어의 검색 결과 및 일치 항목은 각 사전의 수록 내용과 검색 처리에 따라 달라집니다.

### 확인 방법

`npm run test:dictionaries`는 Node의 테스트 도구로 여섯 사전 구성, URL 인코딩,
빈 입력, Collins의 영어 사전 선택, Naver의 `#/search` 경로를 확인합니다.
`npm run typecheck`는 프로젝트 전체의 타입을 검사하고 `npm run build`는 모든 명령을 빌드합니다.
자동 테스트는 실제 사이트 응답이나 Raycast 화면을 확인하지 않으므로 아래 항목도 수동 확인하세요.

- `incumbent`를 입력해도 사전 여섯 개가 모두 보이는지 확인합니다.
- 각 사전에서 Enter를 눌러 검색어가 전달되고, 앞의 다섯 곳은 영어 풀이, 네이버는 영한 풀이가 나오는지 확인합니다.
- `take into account`, `café`, `a&b` 입력 후 ⌘C로 URL을 복사해 검색어가 잘리지 않는지 확인합니다.
- 검색창을 지우고 Enter를 눌러 홈페이지가 열리는지 확인합니다.
- 기존 Switch Audio Device / Convert Currency / Switch Wi-Fi 명령이 계속 표시되는지 확인합니다.

사이트에서 접근 제한, CAPTCHA 또는 검색 결과 없음이 표시되면 일반 브라우저에서 확인하세요.
사이트 URL이 변경되면 `src/modules/dictionaries/dictionaries.ts`의 해당 항목을 수정하면 됩니다.

참고: [Raycast List API](https://developers.raycast.com/api-reference/user-interface/list),
[Raycast Actions API](https://developers.raycast.com/api-reference/user-interface/actions),
[Cambridge 공식 검색 위젯](https://dictionary.cambridge.org/freesearch.html).
