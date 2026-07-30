export type TemplateId = 'flood-alert-patient' | 'flood-alert-chw';
export type TemplateSet = Record<string, Record<string, string>>;

/**
 * Language is configuration, not code — this is what backs the replication
 * claim that a country office adds a language by editing data, not editing
 * the dispatcher. renderTemplate/hasTranslation take the template set as a
 * parameter rather than closing over it, specifically so a new language (or
 * a whole new deployment's template set) is a data change with no code
 * change — see message-templates.spec.ts, which proves it by running the
 * same functions against a template set defined entirely inside the test.
 */
export const DEFAULT_TEMPLATES: TemplateSet = {
  'flood-alert-patient': {
    en: 'Sentinel Alert: Heavy rain has raised flood risk in your area. If you feel unwell, reply or call. A health worker may contact you soon.',
    tw: 'Sentinel Kɔkɔbɔ: Osu kɛse ama nsuyiri ho asiane akɔ soro wɔ wo mpɔtam. Sɛ wo ho ntɔ wo a, bue anaa frɛ. Akwahosan adwumayɛni bɛtumi afrɛ wo.',
    ee: 'Sentinel Ŋkuɖoɖo: Tsi geɖe dza le tɔɖɔɖɔ ƒe afɔku dzi le wò nutome. Ne mèsẽ ŋui o la, ɖo eŋu alo yɔ. Lãmesẽdɔwɔla ate ŋu aƒo ka na wò kpuie.',
  },
  'flood-alert-chw': {
    en: 'Sentinel: Your catchment zone is now HIGH risk. Check the CHW visit list for patients to prioritise.',
    tw: 'Sentinel: Wo mpɔtam no akɔ soro afei. Hwɛ CHW nsrahwɛ list no na woahu amanfoɔ a wɛdi kan.',
    ee: 'Sentinel: Wò nutome le afɔku gã me fifia. Kpɔ CHW ƒe amesiwo nàsrã ƒe nyaeɖoɖo la ɖa be nàdze ame siwo hiã kaba.',
  },
};

export function renderTemplate(
  templates: TemplateSet,
  templateId: string,
  language: string,
): string {
  const set = templates[templateId];
  return set[language] ?? set.en;
}

/** True if a template has a real translation for the language (not the English fallback). */
export function hasTranslation(
  templates: TemplateSet,
  templateId: string,
  language: string,
): boolean {
  return language in templates[templateId];
}
