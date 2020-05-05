import React, { useEffect, useState } from 'react';
import Select from 'react-select';
import { languages } from '../../locales';
import { Spinner } from './Spinner';

const LazyForm = React.lazy(() => import('../inputs/Form'));

export const TranslationForm = ({ value, onChange, flow, schema, formatter = (v) => v }) => {
  const [language, setLanguage] = useState(languages[0]);
  const [translations, setTranslations] = useState(
    languages.map((key) => ({ key, ...formatter(value) }))
  );
  const [actualTranslation, setActualTranslation] = useState(
    translations.find((t) => t.key === language)
  );

  useEffect(() => {
    onChange(translations);
  }, [translations]);

  useEffect(() => {
    setTranslations([...translations.filter((t) => t.key !== language), actualTranslation]);
  }, [actualTranslation]);

  useEffect(() => {
    setActualTranslation(translations.find((t) => t.key === language));
  }, [language]);

  return (
    <div>
      <Select
        value={{ label: language, value: language }}
        placeholder="Select a language"
        options={languages.map((l) => ({ label: l, value: l }))}
        onChange={(e) => setLanguage(e.value)}
        classNamePrefix="reactSelect"
        className="reactSelect"
      />
      <React.Suspense fallback={<Spinner />}>
        <LazyForm
          value={actualTranslation}
          flow={flow}
          schema={schema(language)}
          onChange={(value) => setActualTranslation(value)}
        />
      </React.Suspense>
    </div>
  );
};
