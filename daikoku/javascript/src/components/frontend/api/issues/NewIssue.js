import React, { useContext, useEffect, useState } from 'react';
import { toastr } from 'react-redux-toastr';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Form, type, format, constraints } from '@maif/react-forms';

import { I18nContext } from '../../../../core';
import * as Services from '../../../../services';
import { manage, CanIDoAction, api as API } from '../../../utils';

export const NewIssue = ({ basePath, api }) => {
  const { issuesTags, team, _humanReadableId } = api;
  const [issue, setIssue] = useState(null);
  const [availableApiVersions, setApiVersions] = useState([]);

  const { currentTeam, connectedUser } = useSelector(state => state.context)

  const { translateMethod } = useContext(I18nContext);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      Services.fetchNewIssue(),
      Services.getAllApiVersions(team, api._humanReadableId)
    ])
      .then(([template, apiVersions]) => {
        setIssue(template);
        setApiVersions(apiVersions);
      });
  }, []);

  const createIssue = (issue) => {
    Services.createNewIssue(_humanReadableId, team, issue)
      .then((res) => {
        if (res.error) {
          toastr.error(res.error);
        } else {
          toastr.success('Issue created');
          navigate(basePath);
        }
      });
  }

  const schema = {
    title: {
      type: type.string,
      label: translateMethod('Title'),
      placeholder: translateMethod('Title'),
      constraints: [
        constraints.required(translateMethod("constraints.required.title"))
      ]
    },
    apiVersion: {
      type: type.string,
      format: format.select,
      label: translateMethod('issues.apiVersion'),
      options: availableApiVersions.map(x => ({ label: x, value: x })),
      constraints: [
        constraints.required(translateMethod("constraints.required.version"))
      ]
    },
    tags: {
      type: type.string,
      label: translateMethod('issues.tags'),
      format: format.select,
      options: issuesTags,
      transformer: ({ value, name }) => ({ value, label: name }),
      isMulti: true,
      visible: CanIDoAction(connectedUser, manage, API, currentTeam)
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
          // constraints: [
          //   constraints.length(1, "message")
          // ]
        }
      },
      constraints: [
        constraints.length(1, 'Just one comment please')
      ]
    }
  }


  return issue ? (
    <div className="d-flex">
      <Form
        schema={schema}
        onSubmit={createIssue}
        onError={console.error}
        value={issue}
        actions={{
          cancel: { display: true, action: () => navigate(basePath), label: translateMethod('Cancel') }
        }}
      />
    </div>
  ) : (
    <p>{translateMethod('loading')}</p>
  );
}
