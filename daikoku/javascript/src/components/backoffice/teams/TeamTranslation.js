import React, { useState, useEffect } from 'react';
import Select from 'react-select';

import { TextInput } from '../../inputs';
import { Option, manage, Can, daikoku } from '../../utils';
import { languages } from '../../../locales';

export const TeamTranslationForm = ({ team, t, onTranslationChange }) => {
  const [translation, setTranslation] = useState(t);
  const [language, setLanguage] = useState(languages[0]);

  useEffect(() => {
    onTranslationChange(translation);
  }, [translation]);

  const getTranslatedValue = (key, lng) => {
    return Option(translation)
      .map((t) => t[lng])
      .fold(
        () => undefined,
        (t) => t[key]
      );
  };

  const descriptionKey = `${team._id}.description`;

  const handleChange = (value, key) => {
    setTranslation({ ...translation, [language]: { ...translation[language], [key]: value } });
  };

  return (
    <Can I={manage} a={daikoku} dispatchError>
      <div className="row d-flex flex-column">
        <h1>Team - {team.name}</h1>
        <div>
          <Select
            className="mb-1 col-4"
            value={{ label: language, value: language }}
            placeholder="Select a language"
            options={languages.map((l) => ({ label: l, value: l }))}
            onChange={(e) => setLanguage(e.value)}
          />
          <TextInput
            label="description"
            placeholder={team.description}
            value={getTranslatedValue(descriptionKey, language)}
            onChange={(e) => handleChange(e, descriptionKey)}
          />
        </div>
      </div>
    </Can>
  );
};
