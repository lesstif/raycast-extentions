// Shared helpers for running command-line tools from Raycast commands.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Raycast does not load the shell PATH. Look in the Homebrew and system locations.
const SEARCH_DIRS = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"];

/** Return the full path of a binary, or undefined when it is not installed. */
export function findBinary(name: string): string | undefined {
  return SEARCH_DIRS.map((dir) => `${dir}/${name}`).find((p) => existsSync(p));
}

/** Run a binary with arguments and return its standard output. */
export async function run(bin: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(bin, args);
  return stdout;
}
