import React, { useContext, useState, useEffect } from 'react';
import { Form, constraints, type, format } from '@maif/react-forms';
import { toastr } from 'react-redux-toastr';
import sortBy from 'lodash/sortBy';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import { I18nContext } from '../../../core';
import * as Services from '../../../services';
import { ModalContext } from '../../../contexts';
import { isError, IState, ITeamSimple } from '../../../types';

export const TeamApiSettings = ({
  api,
  apiGroup
}: any) => {
  const { translate } = useContext(I18nContext);
  const { confirm } = useContext(ModalContext);
  const currentTeam = useSelector<IState, ITeamSimple>((s) => s.context.currentTeam);
  const navigate = useNavigate();

  const transferOwnership = ({
    team
  }: any) => {
    Services.transferApiOwnership(team, api.team, api._id).then((r) => {
      if (r.notify) {
        toastr.info(translate('Info'), translate('team.transfer.notified'));
      } else if (r.error) {
        toastr.error(translate('Error'), r.error);
      } else {
        toastr.error(translate('Error'), translate('issues.on_error'));
      }
    });
  };

  const transferSchema = {
    team: {
      type: type.string,
      label: translate('new.owner'),
      format: format.select,
      optionsFrom: Services.teams()
        .then((teams) => {
          if (!isError(teams)) {
            return sortBy(teams.filter((team: any) => team._id !== api.team),'name')
          } else {
            return []
          }
        }
        ),
      transformer: (team: any) => ({
        label: team.name,
        value: team._id
      }),
      constraints: [constraints.required(translate('constraints.required.team'))],
    },
    comfirm: {
      type: type.string,
      label: translate({ key: 'type.api.name.confirmation', replacements: [api.name] }),
      constraints: [
        constraints.oneOf(
          [api.name],
          translate({ key: 'constraints.type.api.name', replacements: [api.name] })
        ),
      ],
    },
  };

  const deleteApi = () => {
    confirm({ message: translate('delete.api.confirm') })
      .then((ok) => {
        if (ok) {
          Services.deleteTeamApi(currentTeam._id, api._id)
            .then(() => navigate(`/${currentTeam._humanReadableId}/settings/apis`))
            .then(() => toastr.success(translate('Success'), translate('deletion successful')));
        }
      });
  };

  return (
    <div>
      <div
        className="action mb-3"
        style={{ border: '1px solid tomato', borderRadius: '4px', padding: '5px' }}
      >
        <h3>{translate('transfer.api.ownership.title')}</h3>
        <i>{translate('transfer.api.ownership.description')}</i>
        <Form
          schema={transferSchema}
          onSubmit={transferOwnership}
          options={{ actions: { submit: { label: translate('Transfer') } } }}
        />
      </div>
      <div
        className="action d-flex flex-row align-items-center"
        style={{ border: '1px solid tomato', borderRadius: '4px', padding: '5px' }}
      >
        <div>
          <h3>{translate('delete.api.title')}</h3>
          <i>{translate('delete.api.description')}</i>
        </div>
        <div className="flex-grow-1 text-end" style={{ paddingRight: '15px' }}>
          <button onClick={deleteApi} className="btn btn-sm btn-outline-danger">
            {translate('Delete this Api')}
          </button>
        </div>
      </div>
    </div>
  );
};
