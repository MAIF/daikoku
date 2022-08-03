import React, { useContext, useEffect, useState } from 'react';
import { Option } from '../components/utils/Option';
import * as Services from '../services';
// @ts-expect-error TS(2732): Cannot find module '../locales/en/translation.json... Remove this comment to see the full error message
import translationEng from '../locales/en/translation.json';
// @ts-expect-error TS(2732): Cannot find module '../locales/fr/translation.json... Remove this comment to see the full error message
import translationFr from '../locales/fr/translation.json';

// @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
export const I18nContext = React.createContext();

const configuration = {
  En: {
    label: 'English',
    translations: translationEng,
  },
  Fr: {
    label: 'Français',
    translations: translationFr,
  },
};

export const I18nProvider = ({
  user,
  tenant,
  children
}: any) => {
  const tenantDefaultLanguage = Option(tenant.defaultLanguage).getOrElse('en');
  const currentLanguage = Option(user?.defaultLanguage).getOrElse(tenantDefaultLanguage);

  const [language, setLanguage] = useState(currentLanguage);
  const [isTranslationMode, setTranslationMode] = useState(
    tenant.tenantMode && tenant.tenantMode === 'Translation'
  );
  const [translations, setTranslations] = useState(configuration);

  useEffect(() => {
    Services.getTranslations('all').then((store) => {
      const tmp = translations;
      store.translations.forEach((translation: any) => {
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        tmp[capitalize(translation.language)].translations[translation.key] = translation.value;
      });
      setTranslations(tmp);
    });
  });

  const capitalize = (l: any) => (l || 'En').charAt(0).toUpperCase() + (l || 'En').slice(1);

  const translate = (
    i18nkey: any,
    language: any,
    plural: any,
    defaultTranslation: any,
    extraConf = undefined,
    replacements: any
  ) => {
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    const maybeTranslationFromConf = Option(translations[capitalize(language)])
      .map((lng: any) => lng.translations)
      .map((t: any) => t[i18nkey]);
    const maybeExtraTranslation = Option(extraConf)
      .map((conf: any) => conf[language])
      .map((lng: any) => lng[i18nkey]);

    const resultFromConf = maybeTranslationFromConf.getOrElse(defaultTranslation || i18nkey);
    const resultWithExtra = maybeExtraTranslation.getOrElse(resultFromConf);

    const replaceChar = (value: any, replacements = []) => {
      if (replacements.length === 0) {
        return value;
      }

      let newValue = value;
      let idx = 0;
      while (newValue.includes('%s')) {
        newValue = newValue.replace('%s', replacements[idx++]);
      }
      return newValue;
    };

    if (typeof resultWithExtra === 'string') {
      return replaceChar(resultWithExtra, replacements);
    } else if (!resultWithExtra.p || !resultWithExtra.s) {
      return replaceChar(resultWithExtra, replacements);
    } else {
      return plural
        ? replaceChar(resultWithExtra.p, replacements)
        : replaceChar(resultWithExtra.s, replacements);
    }
  };

  const translateMethod = (key: any, plural = false, defaultResponse = undefined, ...replacements: any[]) => {
    if (!language) {
      return defaultResponse || key;
    }

    return translate(key, language, plural, defaultResponse, undefined, replacements);
  };

  const Translation = ({
    i18nkey,
    extraConf,
    children,
    count,
    isPlural,
    replacements
  }: any) => {
    const [showEditButton, setShowEditButton] = useState(false);

    // @ts-expect-error TS(2339): Property 'language' does not exist on type 'unknow... Remove this comment to see the full error message
    const { language } = useContext(I18nContext);

    const isTranslationMode = false; // TODO : testing mode

    const pluralOption = Option(count)
      .map((count: any) => count > 1)
      .getOrElse(!!isPlural);

    const translatedMessage = translate(
      i18nkey,
      language,
      pluralOption,
      children,
      extraConf,
      replacements
    );

    if (isTranslationMode) {
      if (showEditButton)
        return (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <div className="d-flex">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <input
              type="text"
              className="form-control"
              value={translatedMessage}
              onChange={() => {}}
            />
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <button
              className="btn btn-sm btn-outline-success mx-1"
              style={{ minWidth: '38px' }}
              onClick={() => setShowEditButton(false)}
            >
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <i className="fas fa-check" />
            </button>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <button
              className="btn btn-sm btn-outline-danger"
              style={{ minWidth: '38px' }}
              onClick={() => setShowEditButton(false)}
            >
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <i className="fas fa-times" />
            </button>
          </div>
        );
      return (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <div
          onMouseEnter={() => setShowEditButton(true)}
          onMouseLeave={() => setShowEditButton(false)}
        >
          {translatedMessage}
        </div>
      );
    }

    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    return <>{translatedMessage}</>;
  };

  const updateTranslation = (translation: any) => {
    // @ts-expect-error TS(2554): Expected 6 arguments, but got 2.
    if (translate(translation.key, translation.language) === translation.value)
      return Services.deleteTranslation(translation);
    return Services.saveTranslation(translation);
  };

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <I18nContext.Provider
      value={{
        language,
        setLanguage,
        isTranslationMode,
        setTranslationMode,
        translateMethod,
        Translation,
        updateTranslation,
        languages: Object.keys(translations).map((value) => ({
          value,
          // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
          label: translations[value].label,
        })),
        translations,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
};
