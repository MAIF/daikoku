import React, { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Select from 'react-select';
import { type, constraints, format } from '@maif/react-forms';
import classNames from 'classnames';
import { useDispatch, useSelector } from 'react-redux';
import { toastr } from 'react-redux-toastr';

import * as Services from '../../../../services';
import { Can, manage, CanIDoAction, api as API } from '../../../utils';
import { I18nContext } from '../../../../core';
import { IState, ITeamSimple } from '../../../../types';
import { ModalContext } from '../../../../contexts';

export function ApiFilter({
  handleFilter,
  filter,
  connectedUser,
  team,
  api,
  selectedVersion,
  setSelectedVersion,
  refresh,
  ownerTeam,
  basePath
}: any) {
  const [availableApiVersions, setApiVersions] = useState<Array<string>>([]);
  const { translate } = useContext(I18nContext);
  const { openFormModal } = useContext(ModalContext);

  const currentTeam = useSelector<IState, ITeamSimple>((state) => state.context.currentTeam);

  const schema = {
    title: {
      type: type.string,
      label: translate('Title'),
      placeholder: translate('Title'),
      constraints: [constraints.required(translate('constraints.required.title'))],
    },
    apiVersion: {
      type: type.string,
      format: format.select,
      label: translate('issues.apiVersion'),
      options: availableApiVersions.map((x) => ({ label: x, value: x })),
      constraints: [constraints.required(translate('constraints.required.version'))],
    },
    tags: {
      type: type.string,
      label: translate('issues.tags'),
      format: format.select,
      options: api.issuesTags,
      transformer: ({
        id,
        name
      }: any) => ({ value: id, label: name }),
      isMulti: true,
      visible: CanIDoAction(connectedUser, manage, API, currentTeam),
    },
    comments: {
      type: type.object,
      label: translate('issues.new_comment'),
      format: format.form,
      array: true,
      schema: {
        content: {
          type: type.string,
          format: format.markdown,
          label: null,
        },
      },
      constraints: [constraints.length(1, 'Just one comment please')],
    },
  };

  const createIssue = (issue: any) => {
    Services.createNewIssue(api._humanReadableId, team, issue)
      .then((res) => {
        if (res.error) {
          toastr.error(translate('Error'), res.error);
        } else {
          toastr.success(translate(''), 'Issue created');
          refresh()
        }
      });
  };

  useEffect(() => {
    Services.getAllApiVersions(team, api._humanReadableId)
      .then(setApiVersions);
  }, []);


  return (
    <div className="d-flex flex-row justify-content-between">
      <div className="d-flex align-items-center">
        <button
          className={classNames(`btn btn-outline-primary`, { active: filter === 'all' })}
          style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
          onClick={() => handleFilter('all')}
        >
          {translate('All')}
        </button>
        <button
          className={classNames(`btn btn-outline-primary`, { active: filter === 'open' })}
          style={{ borderRadius: 0 }}
          onClick={() => handleFilter('open')}
        >
          {translate('issues.open')}
        </button>
        <button
          className={classNames(`btn btn-outline-primary`, { active: filter === 'closed' })}
          style={{ borderLeft: 0, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
          onClick={() => handleFilter('closed')}
        >
          {translate('issues.closed')}
        </button>
        <Select
          id="apiVersion"
          onChange={(apiVersion) => setSelectedVersion(apiVersion)}
          options={[
            ...availableApiVersions.map((iss) => ({ value: iss, label: `Version : ${iss}` })),
            { value: 'all', label: 'All' },
          ]}
          value={selectedVersion}
          className="input-select reactSelect ms-1"
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
            <Link to={`${basePath}/labels`} className="btn btn-outline-primary">
              <i className="fa fa-tag me-1" />
              {translate('issues.tags')}
            </Link>
          </Can>
          <button
            className="btn btn-outline-success ms-1"
            onClick={() =>
              Services.fetchNewIssue()
                .then((newIssue) => openFormModal({
                  title: translate('issues.new_issue'),
                  schema,
                  onSubmit: createIssue,
                  value: newIssue,
                  actionLabel: translate('Create')
                }))}>
            {translate('issues.new_issue')}
          </button>
        </div>
      )}
    </div>
  );
}
