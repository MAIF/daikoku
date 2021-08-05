import React, { useEffect, useState } from 'react';
import { toastr } from 'react-redux-toastr';
import Select from 'react-select';
import { t } from '../../../../locales';
const LazySingleMarkdownInput = React.lazy(() => import('../../../inputs/SingleMarkdownInput'));
import * as Services from '../../../../services';
import { Can, manage } from '../../../utils';
import { api as API } from '../../../utils/permissions';

const styles = {
  commentHeader: {
    backgroundColor: '#eee',
    borderTopLeftRadius: '8px',
    borderTopRightRadius: '8px',
  },
  bold: {
    fontWeight: 'bold',
  },
};

export function NewIssue({ currentLanguage, user, api, ...props }) {
  const { issuesTags, team, _humanReadableId } = api;
  const [issue, setIssue] = useState(null);
  const [availableApiVersions, setApiVersions] = useState([])

  useEffect(() => {
    Services.fetchNewIssue().then((template) => setIssue(template));

    Services.getAllApiVersions(team, api._humanReadableId)
      .then(setApiVersions)
  }, []);

  function createIssue() {
    if (issue.title.length === 0 || issue.comments[0].content.length === 0)
      toastr.error('Title or content are too short');
    else if (!issue.apiVersion)
      toastr.error("Select a version to continue")
    else {
      Services.createNewIssue(_humanReadableId, team, {
        ...issue,
        apiVersion: issue.apiVersion.value,
        tags: issue.tags.map((tag) => tag.value.id),
      }).then((res) => {
        if (res.status === 201) {
          toastr.success('Issue created');
          props.history.push(`${props.basePath}/issues`);
        } else
          res.json().then((r) => toastr.error(r.error));
      });
    }
  }

  return issue ? (
    <div className="d-flex">
      <div className="dropdown pr-2">
        <img
          style={{ width: 42 }}
          src={user.picture}
          className="dropdown-toggle logo-anonymous user-logo"
          data-toggle="dropdown"
          alt="user menu"
        />
      </div>
      <div>
        <div className="px-3 py-2" style={styles.commentHeader}>
          <div>
            <label htmlFor="title">{t('Title', currentLanguage)}</label>
            <input
              id="title"
              type="text"
              className="form-control"
              placeholder={t('Title', currentLanguage)}
              value={issue.title}
              onChange={(e) => setIssue({ ...issue, title: e.target.value })}
            />
          </div>
          <div className="py-2">
            <label htmlFor="apiVersion">{t('issues.apiVersion', currentLanguage)}</label>
            <Select
              id="apiVersion"
              onChange={apiVersion => setIssue({
                ...issue,
                apiVersion
              })
              }
              options={availableApiVersions.map((iss) => ({ value: iss, label: iss }))}
              value={issue.apiVersion}
              className="input-select reactSelect"
              classNamePrefix="reactSelect"
              styles={{
                menu: (provided) => ({ ...provided, zIndex: 9999 }),
              }}
            />
          </div>
          <Can I={manage} a={API} team={props.currentTeam}>
            <div className="py-2">
              <label htmlFor="tags">{t('issues.tags', currentLanguage)}</label>
              <Select
                id="tags"
                isMulti
                onChange={(values) =>
                  setIssue({
                    ...issue,
                    tags: [...values],
                  })
                }
                options={issuesTags.map((iss) => ({ value: iss, label: iss.name }))}
                value={issue.tags}
                className="input-select reactSelect"
                classNamePrefix="reactSelect"
                styles={{
                  menu: (provided) => ({ ...provided, zIndex: 9999 }),
                }}
              />
            </div>
          </Can>
        </div>
        <div
          className="p-3"
          style={{
            border: '1px solid #eee',
            borderBottomLeftRadius: '8px',
            borderBottomRightRadius: '8px',
            backgroundColor: '#fff',
          }}>
          <React.Suspense fallback={<div>{t('loading', currentLanguage)}</div>}>
            <LazySingleMarkdownInput
              currentLanguage={currentLanguage}
              height="300px"
              value={issue.comments[0].content}
              fixedWitdh="0px"
              onChange={(content) =>
                setIssue({
                  ...issue,
                  comments: [
                    {
                      ...issue.comments[0],
                      content,
                    },
                  ],
                })
              }
            />
          </React.Suspense>
          <div className="d-flex mt-3 justify-content-end">
            <button className="btn btn-success" onClick={createIssue}>
              {t('issues.submit_new_issue', currentLanguage)}
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : (
    <p>{t('loading', currentLanguage)}</p>
  );
}