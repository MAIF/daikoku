import React, { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Select from 'react-select';
import { type, constraints, format } from '@maif/react-forms';
import classNames from 'classnames';
import { useDispatch, useSelector } from 'react-redux';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { toastr } from 'react-redux-toastr';

import * as Services from '../../../../services';
import { Can, manage, CanIDoAction, api as API } from '../../../utils';
import { I18nContext, openFormModal } from '../../../../core';

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
  const [availableApiVersions, setApiVersions] = useState([]);
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);
  const dispatch = useDispatch();
  const { currentTeam } = useSelector((state) => (state as any).context);

  const schema = {
    title: {
      type: type.string,
      label: translateMethod('Title'),
      placeholder: translateMethod('Title'),
      constraints: [constraints.required(translateMethod('constraints.required.title'))],
    },
    apiVersion: {
      type: type.string,
      format: format.select,
      label: translateMethod('issues.apiVersion'),
      options: availableApiVersions.map((x) => ({ label: x, value: x })),
      constraints: [constraints.required(translateMethod('constraints.required.version'))],
    },
    tags: {
      type: type.string,
      label: translateMethod('issues.tags'),
      format: format.select,
      options: api.issuesTags,
      transformer: ({
        value,
        name
      }: any) => ({ value, label: name }),
      isMulti: true,
      // @ts-expect-error TS(2554): Expected 8 arguments, but got 4.
      visible: CanIDoAction(connectedUser, manage, API, currentTeam),
    },
    comments: {
      type: type.object,
      label: translateMethod('issues.new_comment'),
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
          toastr.error(res.error);
        } else {
          toastr.success('Issue created');
          refresh()
        }
      });
  };

  useEffect(() => {
    Services.getAllApiVersions(team, api._humanReadableId)
      .then(setApiVersions);
  }, []);


  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="d-flex flex-row justify-content-between">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="d-flex align-items-center">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button
          className={classNames(`btn btn-outline-primary`, { active: filter === 'all' })}
          style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
          onClick={() => handleFilter('all')}
        >
          {translateMethod('All')}
        </button>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button
          className={classNames(`btn btn-outline-primary`, { active: filter === 'open' })}
          style={{ borderRadius: 0 }}
          onClick={() => handleFilter('open')}
        >
          {translateMethod('issues.open')}
        </button>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <button
          className={classNames(`btn btn-outline-primary`, { active: filter === 'closed' })}
          style={{ borderLeft: 0, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
          onClick={() => handleFilter('closed')}
        >
          {translateMethod('issues.closed')}
        </button>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Can I={manage} a={API} team={ownerTeam}>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Link to={`${basePath}/labels`} className="btn btn-outline-primary">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <i className="fa fa-tag me-1" />
              {translateMethod('issues.tags')}
            </Link>
          </Can>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <button
            className="btn btn-outline-success ms-1"
            onClick={() =>
              Services.fetchNewIssue()
                .then((newIssue) => dispatch(openFormModal({
                  title: translateMethod('issues.new_issue'),
                  schema,
                  onSubmit: createIssue,
                  value: newIssue,
                  actionLabel: translateMethod('Create')
                })))}>
            {translateMethod('issues.new_issue')}
          </button>
        </div>
      )}
    </div>
  );
}
