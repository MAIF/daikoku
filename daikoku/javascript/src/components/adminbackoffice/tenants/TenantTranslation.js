import React, { useState, useEffect } from 'react';
import Select from 'react-select';

import { UserBackOffice } from '../../backoffice';
import { TextInput } from '../../inputs';
import { Option, manage, Can, daikoku } from '../../utils';
import * as Services from '../../../services';
import { languages } from '../../../locales';

export const TenantTranslation = ({ match }) => {
  const [translation, setTranslation] = useState({});
  const [tenant, setTenant] = useState(undefined);
  const [language, setLanguage] = useState(languages[0]);

  useEffect(() => {
    if (!tenant) {
      Services.oneTenant(match.params.tenantId).then((tenant) => setTenant(tenant));
    }
  }, []);

  useEffect(() => {
    if (tenant) {
      setTranslation(tenant.translation);
    }
  }, [tenant]);

  const getTranslatedValue = (key, lng) => {
    return Option(translation[lng]).fold(
      () => undefined,
      (t) => t[key]
    );
  };

  const descriptionKey = `${match.params.tenantId}.description`;

  const handleChange = (value, key) => {
    const t = { ...translation, [language]: { ...translation[language], [key]: value } };
    setTranslation(t);
  };

  const save = () => {
    Services.saveTenantTranslations(tenant._id, translation);
  };

  return (
    <UserBackOffice tab="Tenants" isLoading={!tenant}>
      {tenant && (
        <Can I={manage} a={daikoku} dispatchError>
          <div className="row d-flex flex-column">
            <h1>Tenant - {tenant.name}</h1>
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
                placeholder={tenant.style.description}
                value={getTranslatedValue(descriptionKey, language)}
                onChange={(e) => handleChange(e, descriptionKey)}
              />
            </div>
            <div className="row form-back-fixedBtns">
              <button
                style={{ marginLeft: 5 }}
                type="button"
                className="btn btn-outline-success"
                onClick={save}>
                {
                  <span>
                    <i className="fas fa-save" /> Translate
                  </span>
                }
              </button>
            </div>
          </div>
        </Can>
      )}
    </UserBackOffice>
  );
};
