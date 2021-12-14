import { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as Services from '../../../../services';
import Select from 'react-select';
import { Can, manage, api as API } from '../../../utils';
import { I18nContext } from '../../../../core';

export function ApiFilter({
  tags,
  handleFilter,
  filter,
  pathname,
  connectedUser,
  team,
  ownerTeam,
  api,
  selectedVersion,
  setSelectedVersion,
}) {
  const [availableApiVersions, setApiVersions] = useState([]);

  const { translateMethod } = useContext(I18nContext);

  useEffect(() => {
    Services.getAllApiVersions(team, api._humanReadableId).then(setApiVersions);
  }, []);

  return (
    <div className="d-flex flex-row justify-content-between">
      <div className="d-flex align-items-center">
        <button
          className={`btn btn-${filter !== 'all' ? 'outline-' : ''}primary`}
          style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
          onClick={() => handleFilter('all')}
        >
          {translateMethod('All')}
        </button>
        <button
          className={`btn btn-${filter !== 'open' ? 'outline-' : ''}primary`}
          style={{ borderRadius: 0 }}
          onClick={() => handleFilter('open')}
        >
          {translateMethod('issues.open')}
        </button>
        <button
          className={`btn btn-${filter !== 'closed' ? 'outline-' : ''}primary`}
          style={{ borderLeft: 0, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
          onClick={() => handleFilter('closed')}
        >
          {translateMethod('issues.closed')}
        </button>
        <Select
          id="apiVersion"
          onChange={(apiVersion) => setSelectedVersion(apiVersion)}
          options={[
            ...availableApiVersions.map((iss) => ({ value: iss, label: `Version : ${iss}` })),
            { value: 'all', label: 'All' },
          ]}
          value={selectedVersion}
          className="input-select reactSelect ml-1"
          classNamePrefix="reactSelect"
          styles={{
            menu: (provided) => ({ ...provided, zIndex: 9999 }),
            container: (base) => ({
              ...base,
              minWidth: '140px',
            }),
          }}
        />
      </div>

      {connectedUser && !connectedUser.isGuest && (
        <div>
          <Can I={manage} a={API} team={ownerTeam}>
            <Link to={`${pathname}/labels`} className="btn btn-outline-primary">
              <i className="fa fa-tag mr-1" />
              {translateMethod('issues.tags')}
              <span className="badge badge-secondary ml-2">{tags.length || 0}</span>
            </Link>
          </Can>
          <Link to={`${pathname}/issues/new`} className="btn btn-outline-success ml-1">
            {translateMethod('issues.new_issue')}
          </Link>
        </div>
      )}
    </div>
  );
}
