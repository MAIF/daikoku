import React, { useState, useEffect } from 'react';
import { TranslationForm, Option, Can, manage, api as API } from '../../utils';
import { TextInput, CodeInput, Collapse } from '../../inputs';
import { languages } from '../../../locales';

import Select from 'react-select';

export const TeamApiTranslation = ({ value, onChange }) => {
  const getTranslatedValue = (key, lng, orElse = value[key]) => {
    
    return Option(value.translation)
      .map((t) => t[lng])
      .map((t) => t[`${value._id}.${key}`])
      .getOrElse(orElse);
  };

  const flow = ['smallDescription', 'description'];

  const schema = (lng) => {
    const schemaObj = {
      smallDescription: {
        type: 'string',
        props: {
          label: 'small desc.',
          value: getTranslatedValue('smallDescription', lng, ''),
          placeholder: getTranslatedValue('smallDescription', lng),
        },
      },
      description: {
        type: 'code',
        props: {
          label: 'description',
          value: getTranslatedValue('description', lng, ''),
          placeholder: getTranslatedValue('description', lng),
        },
      },
    };

    //todo: value & placeholder doesn't work because of pp is an array
    value.possibleUsagePlans.forEach((pp) => {
      schemaObj[`possibleUsagePlans//${pp._id}//customName`] = {
        type: 'string',
        props: {
          label: 'custom name',
          value: getTranslatedValue(`possibleUsagePlans.${pp._id}.customName`, lng, ''),
          placeholder: getTranslatedValue(`possibleUsagePlans.${pp._id}.customName`, lng),
        },
      };
      schemaObj[`possibleUsagePlans//${pp._id}//customDescription`] = {
        type: 'string',
        props: {
          label: 'custom desc.',
          value: getTranslatedValue(`possibleUsagePlans.${pp._id}.customDescription`, lng, ''),
          placeholder: getTranslatedValue(`possibleUsagePlans.${pp._id}.customDescription`, lng),
        },
      };
    });

    return schemaObj;
  };

  const formattedValue = {
    smallDescription: null,
    description: null,
  };

  value.possibleUsagePlans.forEach((pp) => {
    flow.push(`>>>${pp.type}`);
    flow.push(`possibleUsagePlans//${pp._id}//customName`);
    flow.push(`possibleUsagePlans//${pp._id}//customDescription`);
    formattedValue[`possibleUsagePlans//${pp._id}//customName`] = null;
    formattedValue[`possibleUsagePlans//${pp._id}//customDescription`] = null;
  });

  const handleChange = (translations) => {
    const t = translations
      .map((localizedTranslation) => {
        const language = localizedTranslation.key;
        // delete localizedTranslation.key
        return Object.keys(localizedTranslation)
          .filter((key) => key !== 'key')
          .map((key) => ({
            language,
            key: `${value._id}.${key.replace(/\/\//g, '.')}`,
            value: localizedTranslation[key],
          }))
          .filter((t) => !!t.value);
      })
      .flat();
    onChange(t);
  };

  return (
    <TranslationForm
      onChange={handleChange}
      flow={flow}
      schema={schema}
      value={value}
      formatter={() => formattedValue}
    />
  );
};

export const TeamApiTranslationForm = ({ team, api, t, onTranslationChange }) => {
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

  const smallDescriptionKey = `${api._id}.smallDescription`;
  const descriptionKey = `${api._id}.description`;
  const planCustomNameKey = (plan) => `${api._id}.possibleUsagesPlans.${plan._id}.customName`;
  const planCustomDescriptionKey = (plan) =>
    `${api._id}.possibleUsagesPlans.${plan._id}.customDescription`;

  const handleChange = (value, key) => {
    setTranslation({ ...translation, [language]: { ...translation[language], [key]: value } });
  };

  return (
    <Can I={manage} a={API} team={team} dispatchError>
      <div className="row d-flex flex-column">
        <div>
          <Select
            className="reactSelect mb-1 col-4"
            value={{ label: language, value: language }}
            placeholder="Select a language"
            options={languages.map((l) => ({ label: l, value: l }))}
            onChange={(e) => setLanguage(e.value)}
            classNamePrefix="reactSelect"
          />
          <TextInput
            label="small description"
            placeholder={api.smallDescription}
            value={getTranslatedValue(smallDescriptionKey, language)}
            onChange={(e) => handleChange(e, smallDescriptionKey)}
          />
          <CodeInput
            label="description"
            value={getTranslatedValue(descriptionKey, language)}
            onChange={(e) => handleChange(e, descriptionKey)}
          />
          {api.possibleUsagePlans.map((pp) => {
            const descriptionKey = planCustomDescriptionKey(pp);
            const customeNameKey = planCustomNameKey(pp);

            return (
              <Collapse key={pp._id} label={pp.type} collapsed={true}>
                <TextInput
                  label="custom name"
                  placeholder={pp.customName}
                  value={getTranslatedValue(customeNameKey, language)}
                  onChange={(e) => handleChange(e, customeNameKey)}
                />
                <TextInput
                  label="custom description"
                  placeholder={pp.description}
                  value={getTranslatedValue(descriptionKey, language)}
                  onChange={(e) => handleChange(e, descriptionKey)}
                />
              </Collapse>
            );
          })}
        </div>
      </div>
    </Can>
  );
};
