import React, { FunctionComponent, useContext, useEffect, useState } from 'react';
import { Option } from '../components/utils/Option';
import * as Services from '../services';
import translationEng from '../locales/en/translation.json';
import translationFr from '../locales/fr/translation.json';
import { TOptions } from '../types/types';
import { string } from 'prop-types';

const initI8nContext: TI18ncontext = {
  language: 'en',
  setLanguage: () => { },
  isTranslationMode: false,
  setTranslationMode: () => { },
  translate: () => "",
  Translation: React.Fragment,
  updateTranslation: () => Promise.resolve(true),
  languages: [{ value: 'en', label: 'English' }],
  translations: {},
}
export const I18nContext = React.createContext<TI18ncontext>(initI8nContext);

type TranslationConfig = {
  [lang: string]: {
    label: string,
    translations: {
      [key: string]: string | { s: string, p: string }
    }
  }
}

type TI18ncontext = {
  language: string,
  setLanguage: (l: string) => void,
  isTranslationMode: boolean,
  setTranslationMode: (mode: boolean) => void,
  translate: (params: string | TranslateParams) => string,
  Translation: FunctionComponent<any>,
  updateTranslation: (translation: any) => Promise<any>,
  languages: TOptions,
  translations: TranslationConfig,
}

export type TranslateParams = {
  key: string, 
  plural?: boolean, 
  defaultResponse?: string, 
  replacements?: Array<string>
}


const configuration: TranslationConfig = {
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
  const [translations, setTranslations] = useState<TranslationConfig>(configuration);

  useEffect(() => {
    Services.getTranslations('all')
      .then((store) => {
        const tmp = translations;
        store.translations.forEach((translation: any) => {
          tmp[capitalize(translation.language)].translations[translation.key] = translation.value;
        });
        setTranslations(tmp);
      });
  });

  const capitalize = (l: any) => (l || 'En').charAt(0).toUpperCase() + (l || 'En').slice(1);

  const translateBase = (
    i18nkey: string,
    language: string,
    plural?: boolean,
    defaultTranslation?: string,
    extraConf?: any,
    replacements?: Array<string>
  ) => {
    const maybeTranslationFromConf = Option(translations[capitalize(language)])
      .map((lng: any) => lng.translations)
      .map((t: any) => t[i18nkey]);
    const maybeExtraTranslation = Option(extraConf)
      .map((conf: any) => conf[language])
      .map((lng: any) => lng[i18nkey]);

    const resultFromConf = maybeTranslationFromConf.getOrElse(defaultTranslation || i18nkey);
    const resultWithExtra = maybeExtraTranslation.getOrElse(resultFromConf);

    const replaceChar = (value: any, replacements: Array<string> = []) => {
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

  // const translate = (params: TranslateParams) => {
  //   if (!language) {
  //     return params.defaultResponse || params.key;
  //   }

  //   return translateBase(params.key, language, params.plural, params.defaultResponse, undefined, params.replacements);
  // }




  function translate(key:string):string;
  function translate(params: TranslateParams): string;
  function translate(x: (string | TranslateParams)): string {
    const params = typeof x === 'string' ? {key: x} : x
    if (!language) {
      return params.defaultResponse || params.key;
    }

    return translateBase(params.key, language, params.plural, params.defaultResponse, undefined, params.replacements);
  }











  const Translation = ({
    i18nkey,
    extraConf,
    children,
    count,
    isPlural,
    replacements
  }: any) => {
    const [showEditButton, setShowEditButton] = useState(false);

    const { language } = useContext(I18nContext);

    const isTranslationMode = false; // TODO : testing mode

    const pluralOption = Option(count)
      .map((count: any) => count > 1)
      .getOrElse(!!isPlural);

    const translatedMessage = translateBase(
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
              onChange={() => { }}
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

  const updateTranslation = (translation: any) => {
    if (translateBase(translation.key, translation.language) === translation.value)
      return Services.deleteTranslation(translation);
    return Services.saveTranslation(translation);
  };

  return (
    <I18nContext.Provider
      value={{
        language,
        setLanguage,
        isTranslationMode,
        setTranslationMode, //@ts-ignore
        translate,
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
