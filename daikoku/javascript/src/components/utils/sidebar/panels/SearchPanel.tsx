import React, { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'uuid... Remove this comment to see the full error message
import { v4 as uuid } from 'uuid';
import debounce from 'lodash/debounce';

import * as Services from '../../../../services';
// @ts-expect-error TS(6142): Module '../../../../locales/i18n-context' was reso... Remove this comment to see the full error message
import { I18nContext } from '../../../../locales/i18n-context';

export const SearchPanel = ({
  teams
}: any) => {
  const [results, setResults] = useState([]);

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
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

    return Services.search(inputValue).then((result) =>
      setResults([
        // @ts-expect-error TS(2322): Type '{ label: string; options: { value: string; l... Remove this comment to see the full error message
        utils,
        // @ts-expect-error TS(2322): Type 'any' is not assignable to type 'never'.
        ...result.map((item: any) => ({
          ...item,
          label: translateMethod(item.label)
        })),
      ])
    );
  };

  const debouncedSearch = debounce(search, 100, { leading: true });

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="ms-3 mt-2 col-8 d-flex flex-column panel">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <input
        placeholder={translateMethod('search.placeholder')}
        className="mb-3 form-control"
        onChange={(e) => debouncedSearch(e.target.value)}
      />
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="blocks">
        {results.map((r, idx) => {
          if (!(r as any).options.length) {
            return null;
          }
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          return (<div key={idx} className="mb-3 block">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div className="mb-1 block__category">{(r as any).label}</div>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div className="ms-2 block__entries block__border d-flex flex-column">
                {(r as any).options.map((option: any) => {
        const team = teams.find((t: any) => t._id === option.team);
        switch (option.type) {
            case 'link':
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                return (<Link to={option.url} className="block__entry__link" key={option.value}>
                          {option.label}
                        </Link>);
            case 'tenant':
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                return (<Link to={`/settings/tenants/${option.value}`} className="block__entry__link" key={option.value}>
                          {option.label}
                        </Link>);
            case 'team':
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                return (<Link to={`/${option.value}/settings`} className="block__entry__link" key={option.value}>
                          {option.label}
                        </Link>);
            case 'api':
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
