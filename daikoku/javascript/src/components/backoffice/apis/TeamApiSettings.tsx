import React, { useContext, useState, useEffect } from 'react';
import { Form, constraints, type, format } from '@maif/react-forms';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { toastr } from 'react-redux-toastr';
import sortBy from 'lodash/sortBy';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import { I18nContext } from '../../../core';
import * as Services from '../../../services';

export const TeamApiSettings = ({
  api,
  apiGroup
}: any) => {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);
  const { currentTeam } = useSelector((s) => (s as any).context);
  const navigate = useNavigate();

  const transferOwnership = ({
    team
  }: any) => {
    Services.transferApiOwnership(team, api.team, api._id).then((r) => {
      if (r.notify) {
        toastr.info(translateMethod('team.transfer.notified'));
      } else if (r.error) {
        toastr.error(r.error);
      } else {
        toastr.error(translateMethod('issues.on_error'));
      }
    });
  };

  const transferSchema = {
    team: {
      type: type.string,
      label: translateMethod('new.owner'),
      format: format.select,
      optionsFrom: Services.teams().then((teams) =>
        sortBy(
          teams.filter((team: any) => team._id !== api.team),
          'name'
        )
      ),
      transformer: (team: any) => ({
        label: team.name,
        value: team._id
      }),
      constraints: [constraints.required(translateMethod('constraints.required.team'))],
    },
    comfirm: {
      type: type.string,
      label: translateMethod('type.api.name.confirmation', false, undefined, api.name),
      constraints: [
        constraints.oneOf(
          [api.name],
          translateMethod('constraints.type.api.name', false, undefined, api.name)
        ),
      ],
    },
  };

  const deleteApi = () => {
    (window.confirm(translateMethod('delete.api.confirm')) as any).then((ok: any) => {
    if (ok) {
        Services.deleteTeamApi(currentTeam._id, api._id)
            .then(() => navigate(`/${currentTeam._humanReadableId}/settings/apis`))
            .then(() => toastr.success(translateMethod('deletion successful')));
    }
});
  };

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div
        className="action mb-3"
        style={{ border: '1px solid tomato', borderRadius: '4px', padding: '5px' }}
      >
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <h3>{translateMethod('transfer.api.ownership.title')}</h3>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <i>{translateMethod('transfer.api.ownership.description')}</i>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Form
          schema={transferSchema}
          onSubmit={transferOwnership}
          options={{ actions: { submit: { label: translateMethod('Transfer') } } }}
        />
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div
        className="action d-flex flex-row align-items-center"
        style={{ border: '1px solid tomato', borderRadius: '4px', padding: '5px' }}
      >
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <h3>{translateMethod('delete.api.title')}</h3>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <i>{translateMethod('delete.api.description')}</i>
        </div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="flex-grow-1 text-end" style={{ paddingRight: '15px' }}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <button onClick={deleteApi} className="btn btn-sm btn-outline-danger">
            {translateMethod('Delete this Api')}
          </button>
        </div>
      </div>
    </div>
  );
};
