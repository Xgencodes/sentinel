import {
  DEFAULT_TEMPLATES,
  renderTemplate,
  hasTranslation,
  TemplateSet,
} from './message-templates';

describe('renderTemplate', () => {
  it.each(['en', 'tw', 'ee'])(
    'renders the shipped %s translation',
    (language) => {
      const text = renderTemplate(
        DEFAULT_TEMPLATES,
        'flood-alert-patient',
        language,
      );
      expect(text.length).toBeGreaterThan(0);
      expect(
        hasTranslation(DEFAULT_TEMPLATES, 'flood-alert-patient', language),
      ).toBe(true);
    },
  );

  it('falls back to English for an unsupported language', () => {
    const text = renderTemplate(DEFAULT_TEMPLATES, 'flood-alert-patient', 'fr');
    expect(text).toBe(DEFAULT_TEMPLATES['flood-alert-patient'].en);
    expect(hasTranslation(DEFAULT_TEMPLATES, 'flood-alert-patient', 'fr')).toBe(
      false,
    );
  });

  it('adding a language requires no code change — a new template set proves it', () => {
    // This is the whole claim: renderTemplate/hasTranslation take the
    // template set as data. A country office adding Hausa edits a set like
    // this one; nothing here is imported from message-templates.ts's own
    // DEFAULT_TEMPLATES or its code.
    const withHausa: TemplateSet = {
      'flood-alert-patient': {
        en: 'Flood alert.',
        ha: 'Ambaliyar ruwa faɗakarwa.',
      },
    };

    expect(renderTemplate(withHausa, 'flood-alert-patient', 'ha')).toBe(
      'Ambaliyar ruwa faɗakarwa.',
    );
    expect(hasTranslation(withHausa, 'flood-alert-patient', 'ha')).toBe(true);
  });

  it('a template set with only English still works for every function', () => {
    const englishOnly: TemplateSet = {
      'flood-alert-patient': { en: 'Flood alert.' },
    };

    expect(renderTemplate(englishOnly, 'flood-alert-patient', 'tw')).toBe(
      'Flood alert.',
    );
  });
});
