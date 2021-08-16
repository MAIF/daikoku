import React, { useState } from "react";
import { Option } from "../components";
import { getTrad } from "../locales";

export const I18nContext = React.createContext();

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
            translateMethod
        }}>
            {children}
        </I18nContext.Provider>
    )
}