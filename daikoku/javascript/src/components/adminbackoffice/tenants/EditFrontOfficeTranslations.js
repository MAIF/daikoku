import React, { useContext, useEffect, useState } from 'react';
import { I18nContext } from '../../../core';
import * as Services from '../../../services';
import { v4 as uuid } from 'uuid';
import { PaginatedComponent } from '../../utils';
import { toastr } from 'react-redux-toastr';

const TranslationInput = ({ key, tsl, save }) => {
  const [edited, setEdited] = useState(false);
  const [values, setValues] = useState(tsl);

  const entryValues = tsl;

  const onChange = (newValue, translation) => {
    setValues(
      values.map((value) => {
        const { key, language } = value;
        if (key === translation.key && language === translation.language)
          return {
            ...translation,
            value: newValue,
          };
        return value;
      })
    );
  };

  return (
    <div className="px-3 py-1 section mb-2" key={`${key}`}>
      <div className="d-flex align-items-center justify-content-between">
        <div>
          <span className="badge bg-info me-3 align-self-center">Default</span>
          <span style={{ fontWeight: 'bold' }}>{tsl.length > 0 ? tsl[0].default : key}</span>
        </div>
        {!edited && (
          <button className="btn btn-sm btn-outline-info" onClick={setEdited}>
            <i className="fas fa-edit" />
          </button>
        )}
        {edited && (
          <div className="d-flex">
            <button
              className="btn btn-sm btn-outline-success mx-1"
              onClick={() => {
                save(values);
                setEdited(false);
              }}
            >
              <i className="fas fa-save" />
            </button>
            <button
              className="btn btn-sm btn-outline-danger"
              onClick={() => {
                setValues(entryValues);
                setEdited(false);
              }}
            >
              <i className="fas fa-times" />
            </button>
          </div>
        )}
      </div>
      {edited &&
        values.map((v) => {
          const { key, language, value } = v;
          return (
            <div className="input-group input-group-sm mt-2">
              <div className="input-group-prepend">
                <div className="input-group-text" style={{ minWidth: '38px' }}>
                  {language}
                </div>
              </div>
              <input
                className="form-control"
                key={`${key}${language}`}
                value={value}
                onChange={(e) => onChange(e.target.value, v)}
              />
            </div>
          );
        })}
    </div>
  );
};

export function EditFrontOfficeTranslations(props) {
  const [translations, setTranslations] = useState({});
  const [filteredTranslations, setFilteredTranslations] = useState([]);
  const [searched, setSearched] = useState('');

  const {
    updateTranslation,
    translations: globalTranslations,
    translateMethod,
  } = useContext(I18nContext);

  useEffect(() => {
    loadTranslations();
  }, []);

  const loadTranslations = () => {
    Services.getTranslations('all').then((store) => {
      setTranslations(
        Object.entries({ ...globalTranslations })
          .map(([language, { _, translations: t }]) =>
            Object.entries(t).map(([key, value]) => {
              const existingTranslation = store.translations.find(
                (f) => f.key === key && f.language === language.toLowerCase()
              );
              return {
                _id: uuid(),
                key,
                language: language.toLowerCase(),
                value: existingTranslation ? existingTranslation.value : value,
                _tenant: props.tenantId,
                lastModificationAt: existingTranslation
                  ? existingTranslation.lastModificationAt
                  : undefined,
                default: value,
              };
            })
          )
          .flatMap((f) => f)
          .filter((f) => typeof f.default === 'string' || f.default instanceof String)
          .reduce(
            (acc, current) => ({
              ...acc,
              [current.key]: acc[current.key] ? [...acc[current.key], current] : [current],
            }),
            {}
          )
      );
    });
  };

  useEffect(() => {
    if (!searched || searched.length === 0) setFilteredTranslations(Object.entries(translations));
    else {
      let filtered = Object.entries(translations).filter(([key]) =>
        key.toLowerCase().includes(searched)
      );
      if (filtered.length === 0)
        filtered = Object.entries(translations).filter(([_, tsl]) =>
          tsl.find((t) => t.value.toLowerCase().includes(searched))
        );

      setFilteredTranslations(filtered);
    }
  }, [translations, searched]);

  return (
    <div>
      <input
        type="text"
        className="form-control my-3"
        placeholder={translateMethod('Search translation')}
        value={searched}
        onChange={(e) => setSearched(e.target.value.toLowerCase())}
      />
      <PaginatedComponent
        items={_.sortBy(filteredTranslations, [([key]) => key])}
        count={8}
        columnMode
        formatter={([key, tsl]) => {
          return (
            <TranslationInput
              key={key}
              tsl={tsl}
              save={(values) => {
                Promise.all(values.map((value) => updateTranslation(value))).then(() => {
                  toastr.success(translateMethod('mailing_internalization.translation_updated'));
                  loadTranslations();
                });
              }}
            />
          );
        }}
      />
    </div>
  );
}
