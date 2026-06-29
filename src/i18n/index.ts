import { Lang, LocalizedString } from "../types";
import en from "./en.json";
import ja from "./ja.json";

const dictionaries: Record<Lang, Record<string, string>> = { en, ja };

/** Look up a UI string, with {placeholder} interpolation. */
export function t(lang: Lang, key: string, vars?: Record<string, string>): string {
  let s = dictionaries[lang][key] ?? dictionaries.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(`{${k}}`, v);
    }
  }
  return s;
}

/** Pick the active-language value from an instruction-set LocalizedString. */
export function loc(lang: Lang, value: LocalizedString): string {
  return value[lang] ?? value.en ?? "";
}

export const LANGS: Lang[] = ["en", "ja"];
