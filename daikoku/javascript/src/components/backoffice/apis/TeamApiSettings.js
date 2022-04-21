import React, { useContext, useState, useEffect } from 'react';
import { Form, constraints, type, format } from '@maif/react-forms';
import { toastr } from 'react-redux-toastr';
import { sortBy } from 'lodash';
import { useSelector } from 'react-redux';

import { I18nContext } from '../../../core';
import * as Services from '../../../services';

export const TeamApiSettings = ({ api }) => {
  const { translateMethod } = useContext(I18nContext);
  const { currentTeam } = useSelector(s => s.context)

  const transferOwnership = ({ team }) => {
    Services.transferApiOwnership(team, api.team, api._id)
      .then(r => {
        if (r.notify) {
          toastr.info('Team has been notified. please wait until acceptation')
        } else if (r.error) {
          toastr.error(r.error)
        } else {
          toastr.error('oops')
        }
      })
  }

  const transferSchema = {
    team: {
      type: type.string,
      label: 'New owner team',
      format: format.select,
      optionsFrom: Services.teams().then(teams => sortBy(teams.filter(team => team._id !== api.team), 'name')),
      transformer: team => ({ label: team.name, value: team._id })
    },
    comfirm: {
      type: type.string,
      label: `please type ${api.name} to confirm`,
      constraints: [
        constraints.oneOf([api.name], `please type ${api.name} to valid the transfer`)
      ]
    }
  }

  const deleteApi = () => {
    window.confirm(translateMethod('delete.api.confirm'))
      .then((ok) => {
        if (ok) {
          Services.deleteTeamApi(currentTeam._id, api._id)
            .then(() => navigate(`/${currentTeam._humanReadableId}/settings/apis`))
            .then(() => toastr.success(translateMethod('deletion successful')));
        }
      });
  };

  return (
    <div>
      <div className="action mb-3" style={{ border: "1px solid tomato", borderRadius: '4px', padding: '5px' }}>
        <h3>{translateMethod('transfer.api.ownership.title')}</h3>
        <i>{translateMethod('transfer.api.ownership.description')}</i>
        <Form schema={transferSchema} onSubmit={transferOwnership} options={{ actions: { submit: { label: translateMethod('Transfer') } } }} />
      </div>
      <div className="action d-flex flex-row align-items-center" style={{ border: "1px solid tomato", borderRadius: '4px', padding: '5px' }}>
        <div>
          <h3>{translateMethod('delete.api.title')}</h3>
          <i>{translateMethod('delete.api.description')}</i>
        </div>
        <div className="flex-grow-1 text-end" style={{paddingRight: '15px'}}>
          <button onClick={deleteApi} className="btn btn-sm btn-outline-danger">
            {translateMethod('Delete this Api')}
          </button>
        </div>
      </div>
    </div>
  )
}