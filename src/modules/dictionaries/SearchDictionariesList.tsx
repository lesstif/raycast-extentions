import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { useState } from "react";
import { dictionaries, dictionaryUrl } from "./dictionaries";

export default function SearchDictionariesList() {
  const [searchText, setSearchText] = useState("");
  const query = searchText.trim();

  return (
    <List
      navigationTitle="Search Dictionaries"
      searchBarPlaceholder="Enter an English word or phrase…"
      searchText={searchText}
      onSearchTextChange={setSearchText}
      filtering={false}
    >
      <List.Section title={query ? `Search for “${query}”` : "Type a word, then choose a dictionary"}>
        {dictionaries.map((dictionary) => {
          const url = dictionaryUrl(dictionary, searchText);
          return (
            <List.Item
              key={dictionary.id}
              id={dictionary.id}
              icon={Icon.Book}
              title={dictionary.name}
              subtitle={dictionary.description}
              accessories={[{ text: dictionary.language }]}
              actions={
                <ActionPanel>
                  <Action.OpenInBrowser title={query ? `Search “${query}”` : "Open Dictionary"} url={url} />
                  <Action.CopyToClipboard
                    title="Copy Dictionary URL"
                    content={url}
                    shortcut={{ modifiers: ["cmd"], key: "c" }}
                  />
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
    </List>
  );
}
