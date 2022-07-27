import React, { useContext, useEffect, useState } from 'react';
import { Option } from '../components/utils/Option';
import * as Services from '../services';
import translationEng from '../locales/en/translation.json';
import translationFr from '../locales/fr/translation.json';

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

export const I18nProvider = ({ user, tenant, children }) => {
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
      store.translations.forEach((translation) => {
        tmp[capitalize(translation.language)].translations[translation.key] = translation.value;
      });
      setTranslations(tmp);
    });
  });

  const capitalize = (l) => (l || 'En').charAt(0).toUpperCase() + (l || 'En').slice(1);

  const translate = (
    i18nkey,
    language,
    plural,
    defaultTranslation,
    extraConf = undefined,
    replacements
  ) => {
    const maybeTranslationFromConf = Option(translations[capitalize(language)])
      .map((lng) => lng.translations)
      .map((t) => t[i18nkey]);
    const maybeExtraTranslation = Option(extraConf)
      .map((conf) => conf[language])
      .map((lng) => lng[i18nkey]);

    const resultFromConf = maybeTranslationFromConf.getOrElse(defaultTranslation || i18nkey);
    const resultWithExtra = maybeExtraTranslation.getOrElse(resultFromConf);

    const replaceChar = (value, replacements = []) => {
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

  const translateMethod = (key, plural = false, defaultResponse = undefined, ...replacements) => {
    if (!language) {
      return defaultResponse || key;
    }

    return translate(key, language, plural, defaultResponse, undefined, replacements);
  };

  const Translation = ({ i18nkey, extraConf, children, count, isPlural, replacements }) => {
    const [showEditButton, setShowEditButton] = useState(false);

    const { language } = useContext(I18nContext);

    const isTranslationMode = false; // TODO : testing mode

    const pluralOption = Option(count)
      .map((count) => count > 1)
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
          <div className="d-flex">
            <input
              type="text"
              className="form-control"
              value={translatedMessage}
              onChange={() => {}}
            />
            <button
              className="btn btn-sm btn-outline-success mx-1"
              style={{ minWidth: '38px' }}
              onClick={() => setShowEditButton(false)}
            >
              <i className="fas fa-check" />
            </button>
            <button
              className="btn btn-sm btn-outline-danger"
              style={{ minWidth: '38px' }}
              onClick={() => setShowEditButton(false)}
            >
              <i className="fas fa-times" />
            </button>
          </div>
        );
      return (
        <div
          onMouseEnter={() => setShowEditButton(true)}
          onMouseLeave={() => setShowEditButton(false)}
        >
          {translatedMessage}
        </div>
      );
    }

    return <>{translatedMessage}</>;
  };

  const updateTranslation = (translation) => {
    if (translate(translation.key, translation.language) === translation.value)
      return Services.deleteTranslation(translation);
    return Services.saveTranslation(translation);
  };

  return (
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
          label: translations[value].label,
        })),
        translations,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
};
