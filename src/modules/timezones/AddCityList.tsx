import { Action, ActionPanel, Form, Icon, List, useNavigation } from "@raycast/api";
import { useMemo, useState } from "react";
import { City, cityCatalog, countryFlag, customCity, sameCity, searchCities, timeZoneDescription } from "./cities";
import { cityLabel } from "./time";

const CATALOG = cityCatalog();
const TIME_ZONES = [...new Set([...CATALOG.map((city) => city.timeZone), Intl.DateTimeFormat().resolvedOptions().timeZone])].sort();

interface Props {
  cities: City[];
  instant: number;
  replacing?: City;
  initialQuery?: string;
  onSelect: (city: City) => Promise<boolean>;
}

function CustomCityForm({ onSelect, replacing, instant, initialName, onBack }: Pick<Props, "onSelect" | "replacing" | "instant"> & { initialName: string; onBack: () => void }) {
  const { pop } = useNavigation();
  const [name, setName] = useState(initialName);
  const [timeZone, setTimeZone] = useState(replacing?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);

  async function submit() {
    let city: City;
    try {
      city = customCity(name, timeZone);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check the city name and time zone.");
      return;
    }
    setIsLoading(true);
    try {
      if (await onSelect(city)) pop();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form
      navigationTitle={replacing ? `Replace ${cityLabel(replacing, instant)}` : "Add a Custom City"}
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title={replacing ? "Replace City" : "Add City"} onSubmit={submit} />
          <Action title="Back to Search" icon={Icon.ArrowLeft} onAction={onBack} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name" title="City Name" value={name} autoFocus error={error}
        onChange={(value) => { setName(value); setError(undefined); }}
      />
      <Form.Dropdown id="timeZone" title="IANA Time Zone" value={timeZone} onChange={setTimeZone}>
        {TIME_ZONES.map((zone) => <Form.Dropdown.Item key={zone} value={zone} title={zone} />)}
      </Form.Dropdown>
      <Form.Description title="Custom Cities" text="Add a city that is not in the database. Select its IANA time zone explicitly; the time zone is not guessed from the city name. The flag follows the selected time zone." />
    </Form>
  );
}

export default function AddCityList({ cities, onSelect, replacing, instant, initialQuery = "" }: Props) {
  const { pop } = useNavigation();
  const [searchText, setSearchText] = useState(initialQuery);
  const [isLoading, setIsLoading] = useState(false);
  const [isCustom, setIsCustom] = useState(false);
  const available = useMemo(() => {
    return searchCities(searchText).filter((city) => !cities.some((selected) => sameCity(selected, city)));
  }, [cities, searchText]);

  async function add(city: City) {
    setIsLoading(true);
    try {
      if (await onSelect(city)) pop();
    } finally {
      setIsLoading(false);
    }
  }

  const customAction = (
    <Action
      title={replacing ? "Edit Name and Time Zone" : "Add a Custom City"} icon={Icon.Pencil}
      onAction={() => setIsCustom(true)}
      shortcut={{ modifiers: ["cmd"], key: "n" }}
    />
  );

  if (isCustom) {
    return (
      <CustomCityForm
        onSelect={onSelect} replacing={replacing} instant={instant} initialName={searchText.trim() || replacing?.name || ""}
        onBack={() => setIsCustom(false)}
      />
    );
  }

  return (
    <List
      navigationTitle={replacing ? `Replace ${cityLabel(replacing, instant)}` : "Add a City"}
      searchBarPlaceholder="Search London, Seoul, KST, PST, Asia/Tokyo…"
      searchText={searchText}
      onSearchTextChange={setSearchText}
      filtering={false}
      isLoading={isLoading}
    >
      <List.Section title={available.length ? `City and Time-Zone Results · ${available.length}` : "No Results (Saved Cities Excluded)"}>
        {available.map((city) => (
          <List.Item
            key={city.id} id={city.id} title={cityLabel(city, instant)} subtitle={city.timeZone} icon={countryFlag(city)}
            accessories={[{ text: replacing ? "Replace" : "Add", tooltip: timeZoneDescription(city.timeZone) }]}
            actions={
              <ActionPanel>
                <Action title={replacing ? "Replace with This City" : "Add to Comparison"} icon={replacing ? Icon.Pencil : Icon.Plus} onAction={() => add(city)} />
                {customAction}
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
      <List.Section>
        <List.Item
          id="custom-city" title={replacing ? "Edit Name and Time Zone…" : "Add a Custom City…"} icon={Icon.Pencil}
          actions={<ActionPanel>{customAction}</ActionPanel>}
        />
      </List.Section>
    </List>
  );
}
