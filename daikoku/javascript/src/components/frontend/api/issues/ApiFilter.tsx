import { constraints, format, type } from '@maif/react-forms';
import classNames from 'classnames';
import { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Select, { CSSObjectWithLabel } from 'react-select';
import { toast } from 'sonner';

import { I18nContext, ModalContext } from '../../../../contexts';
import * as Services from '../../../../services';
import { api as API, Can, CanIDoAction, manage } from '../../../utils';
import { IApi, ITeamSimple, IUserSimple } from '../../../../types';

type ApiFilterProps = {
  handleFilter,
  filter,
  connectedUser: IUserSimple,
  team: string,
  api: IApi,
  selectedVersion: string,
  setSelectedVersion: (version: string) => void,
  refresh: () => void,
  ownerTeam: ITeamSimple,
  basePath: string,
}

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
  basePath,
}: ApiFilterProps) {
  const [availableApiVersions, setApiVersions] = useState<Array<string>>([]);
  const { translate } = useContext(I18nContext);
  const { openFormModal } = useContext(ModalContext);

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
      visible: CanIDoAction(connectedUser, manage, API, ownerTeam),
    },
    comment: {
      type: type.string,
      label: translate('issues.new_comment'),
      format: format.markdown
    },
  };

  const createIssue = (issue) => {
    Services.createNewIssue(api._humanReadableId, team, issue)
      .then((res) => {
        if (res.error) {
          toast.error(res.error);
        } else {
          toast.success('Issue created');
          refresh()
        }
      });
  };

  useEffect(() => {
    Services.getAllApiVersions(team, api._humanReadableId)
      .then(setApiVersions);
  }, []);


  interface VersionOption {
    readonly value: string;
    readonly label: string;
    readonly isFixed?: boolean;
    readonly isDisabled?: boolean;
  }

  const options: readonly VersionOption[] = [
    ...availableApiVersions.map((iss) => ({ value: iss, label: `Version : ${iss}` })),
    { value: 'all version', label: 'All version' },
  ]

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
          onChange={(apiVersion) => setSelectedVersion(apiVersion!)} //@ts-ignore
          options={options}
          value={selectedVersion}
          className="input-select reactSelect ms-1"
          classNamePrefix="reactSelect"
          styles={{
            menu: (provided) => ({ ...provided, zIndex: 9999 } as CSSObjectWithLabel),
            container: (base) => ({
              ...base,
              minWidth: '140px',
            } as CSSObjectWithLabel),
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
                  onSubmit: d => createIssue({...d, comments: [{content: d.comment, by: connectedUser._id}]}),
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
