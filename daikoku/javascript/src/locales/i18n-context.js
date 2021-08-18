import React, { useContext, useState } from "react";
import { Option } from "../components";
import { configuration } from './configuration';

export const I18nContext = React.createContext();

const getTrad = (
    i18nkey,
    language,
    plural,
    defaultTranslation,
    extraConf = undefined,
    replacements
) => {
    const maybeTranslationFromConf = Option(configuration[language])
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

const Translation = ({
    i18nkey,
    extraConf,
    children,
    count,
    isPlural,
    replacements,
}) => {
    const { language } = useContext(I18nContext);

    const pluralOption = Option(count)
        .map((count) => count > 1)
        .getOrElse(!!isPlural);

    return <>{getTrad(i18nkey, language, pluralOption, children, extraConf, replacements)}</>;
};

export const I18nProvider = ({ tenant, children }) => {
    const [language, setLanguage] = useState(Option(tenant.defaultLanguage).getOrElse('en'))
    const [isTranslationMode, setTranslationMode] = useState(tenant.tenantMode && tenant.tenantMode === "Translation");

    const translateMethod = (key, plural = false, defaultResponse = undefined, ...replacements) => {
        if (!language) {
            return defaultResponse || key;
        }

        return getTrad(key, language, plural, defaultResponse, undefined, replacements);
    };

    return (
        <I18nContext.Provider value={{
            language,
            setLanguage,
            isTranslationMode,
            setTranslationMode,
            translateMethod,
            Translation,
            configuration
        }}>
            {children}
        </I18nContext.Provider>
    )
}