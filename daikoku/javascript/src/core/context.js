import React, { useState } from "react";
import { getTrad } from "../locales";

export const I18nContext = React.createContext();

export const I18nProvider = ({ children }) => {
    const [language, setLanguage] = useState("en")
    const [isTranslationMode, setTranslationMode] = useState(false);

    const t = (key, plural = false, defaultResponse = undefined, ...replacements) => {
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
            t
        }}>
            {children}
        </I18nContext.Provider>
    )
}