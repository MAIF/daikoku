import React, { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';

import * as Services from '../../../../services';
import { I18nContext } from '../../../../locales/i18n-context';

export const SearchPanel = ({ teams }) => {
  const [results, setResults] = useState([]);

  const { translateMethod } = useContext(I18nContext);

  const { tenant, connectedUser } = useSelector((state) => state.context)

  useEffect(() => {
    debouncedSearch("")
  }, []);


  const search = (inputValue) => {
    const options = [
      {
        value: 'me',
        label: translateMethod('My profile'),
        type: 'link',
        url: '/settings/me',
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
      .then((result) => setResults([
        utils,
        ...result.map((item) => ({ ...item, label: translateMethod(item.label) })),
      ]));
  };

  const debouncedSearch = _.debounce(search, 100, { leading: true })

  return (
    <div className='ms-3 mt-2 col-10 d-flex flex-column panel'>
      <input
        placeholder='Search for API, team and more... '
        className='mb-3 form-control'
        onChange={e => debouncedSearch(e.target.value)} />
      <div className="blocks">
        {results.map((r, idx) => {
          if (!r.options.length) {
            return null;
          }
          return (
            <div key={idx} className="mb-3 block">
              <div className="mb-1 block__category">{r.label}</div>
              <div className='ms-2 block__entries d-flex flex-column'>
                {r.options.map((option) => {
                  const team = teams.find((t) => t._id === option.team);
                  switch (option.type) {
                    case 'link':
                      return (
                        <Link
                          to={option.url}
                          className='block__entry__link'
                          key={option.value}
                        >{option.label}</Link>
                      )
                    case 'tenant':
                      return (
                        <Link
                          to={`/settings/tenants/${option.value}`}
                          className='block__entry__link'
                          key={option.value}
                        >{option.label}</Link>
                      )
                    case 'team':
                      return (
                        <Link
                          to={`/${option.value}`}
                          className='block__entry__link'
                          key={option.value}
                        >{option.label}</Link>
                      )
                    case 'api':
                      return (
                        <Link
                          to={`/${team ? team._humanReadableId : option.team}/${option.value}/${option.version}`}
                          className='block__entry__link'
                          key={option.value}
                        >{option.label}</Link>
                      )
                  }

                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}