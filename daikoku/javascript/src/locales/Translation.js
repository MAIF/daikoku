import React from 'react';
import { PropTypes } from 'prop-types';
import { Option } from '../components/utils/Option'
import {configuration} from './'

const getTrad = (i18nkey, language, plural, defaultTranslation, extraConf = undefined, replacements) =>  {
  const maybeTranslationFromConf = Option(configuration[language])
    .map(lng => lng.translations)
    .map(t => t[i18nkey])
  const maybeExtraTranslation = Option(extraConf).map(conf => conf[language]).map(lng => lng[i18nkey])

  const resultFromConf = maybeTranslationFromConf.getOrElse(defaultTranslation || i18nkey)
  const resultWithExtra = maybeExtraTranslation.getOrElse(resultFromConf)

  const replaceChar = (value, replacements = []) => {
    if (replacements.length === 0) {
      return value;
    }

    let newValue = value;
    let idx = 0;
    while(newValue.includes('%s')) {
      newValue = newValue.replace('%s', replacements[idx++]);
    }
    return newValue;
  }

  if (typeof resultWithExtra === 'string') {
    return replaceChar(resultWithExtra, replacements);
  } else if (!resultWithExtra.p || !resultWithExtra.s) {
    return replaceChar(resultWithExtra, replacements);
  } else {
    return plural ? replaceChar(resultWithExtra.p, replacements) : replaceChar(resultWithExtra.s, replacements)
  }
}

export const Translation = ({language, i18nkey, extraConf, children, count, isPlural, replacements}) => {
  const pluralOption = Option(count)
    .map(count => count > 1)
    .getOrElse(!!isPlural)

  return (
    <>
      {getTrad(i18nkey, language, pluralOption, children, extraConf, replacements)}
    </>
  )
}

Translation.propTypes = {
  language: PropTypes.string.isRequired,
  i18nkey: PropTypes.string.isRequired,
  extraConf: PropTypes.object,
};

export const t = (key, language, plural = false, defaultResponse = undefined, ...replacements) => {
  if(!language) {
    return defaultResponse || key
  }

  return getTrad(key, language, plural, defaultResponse, undefined, replacements)
}