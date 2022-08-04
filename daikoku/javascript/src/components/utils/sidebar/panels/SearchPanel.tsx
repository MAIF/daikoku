import React, { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { v4 as uuid } from 'uuid';
import debounce from 'lodash/debounce';

import * as Services from '../../../../services';
import { I18nContext } from '../../../../locales/i18n-context';

export const SearchPanel = ({
  teams
}: any) => {
  const [results, setResults] = useState<Array<any>>([]);

  const { translateMethod } = useContext(I18nContext);

  const { tenant, connectedUser } = useSelector((state) => (state as any).context);

  useEffect(() => {
    debouncedSearch('');
  }, []);

  const search = (inputValue: any) => {
    const options = [
      {
        value: 'me',
        label: translateMethod('My profile'),
        type: 'link',
        url: '/me',
      },
    ];
    if (connectedUser?.isDaikokuAdmin)
      options.push({
        value: 'daikoku',
        label: translateMethod('Daikoku settings'),
        type: 'link',
        url: `/settings/tenants/${tenant._humanReadableId}`,
      });

    const utils = {
      label: 'Daikoku',
      options: options.filter((i) => i.label.toLowerCase().includes(inputValue.toLowerCase())),
    };

    return Services.search(inputValue)
      .then((result) =>
        setResults([
          utils,
          ...result.map((item: any) => ({
            ...item,
            label: translateMethod(item.label)
          })),
        ])
      );
  };

  const debouncedSearch = debounce(search, 100, { leading: true });

  return (
    <div className="ms-3 mt-2 col-8 d-flex flex-column panel">
      <input
        placeholder={translateMethod('search.placeholder')}
        className="mb-3 form-control"
        onChange={(e) => debouncedSearch(e.target.value)}
      />
      <div className="blocks">
        {results.map((r, idx) => {
          if (!(r as any).options.length) {
            return null;
          }
          return (<div key={idx} className="mb-3 block">
            <div className="mb-1 block__category">{(r as any).label}</div>
            <div className="ms-2 block__entries block__border d-flex flex-column">
              {(r as any).options.map((option: any) => {
                const team = teams.find((t: any) => t._id === option.team);
                switch (option.type) {
                  case 'link':
                    return (<Link to={option.url} className="block__entry__link" key={option.value}>
                      {option.label}
                    </Link>);
                  case 'tenant':
                    return (<Link to={`/settings/tenants/${option.value}`} className="block__entry__link" key={option.value}>
                      {option.label}
                    </Link>);
                  case 'team':
                    return (<Link to={`/${option.value}/settings`} className="block__entry__link" key={option.value}>
                      {option.label}
                    </Link>);
                  case 'api':
                    return (<Link to={`/${team ? team._humanReadableId : option.team}/${option.value}/${option.version}/description`} className="block__entry__link" key={`${option.value}-${option.version}`}>
                      {`${option.label} - ${option.version}`}
                    </Link>);
                }
              })}
            </div>
          </div>);
        })}
      </div>
    </div>
  );
};
