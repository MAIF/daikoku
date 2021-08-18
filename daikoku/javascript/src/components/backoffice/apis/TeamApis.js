import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import { connect } from 'react-redux';
import { toastr } from 'react-redux-toastr';
import faker from 'faker';

import * as Services from '../../../services';
import { Can, read, manage, stat, api as API } from '../../utils';
import { TeamBackOffice } from '../..';
import { SwitchButton, Table, BooleanColumnFilter } from '../../inputs';
import { I18nContext, setError } from '../../../core';

function TeamApisComponent(props) {
  const { translateMethod, Translation } = useContext(I18nContext);

  let table;

  const columns = [
    {
      id: 'name',
      Header: translateMethod('Name'),
      style: { textAlign: 'left' },
      accessor: (api) => `${api.name} - (${api.currentVersion})`,
      sortType: 'basic',
    },
    {
      Header: translateMethod('Description'),
      style: { textAlign: 'left' },
      accessor: (api) => api.smallDescription,
    },
    {
      Header: translateMethod('Published'),
      style: { textAlign: 'center' },
      accessor: (api) => api.published,
      disableSortBy: true,
      Filter: BooleanColumnFilter,
      filter: 'equals',
      Cell: ({
        cell: {
          row: { original },
        },
      }) => {
        const api = original;
        return (
          <Can I={manage} a={API} team={props.currentTeam}>
            <SwitchButton
              onSwitch={() => togglePublish(api)}
              checked={api.published}
              disabled={api.visibility === 'AdminOnly'}
              large
              noText
            />
          </Can>
        );
      },
    },
    {
      Header: translateMethod('Actions'),
      style: { textAlign: 'center' },
      disableSortBy: true,
      disableFilters: true,
      accessor: (item) => item._id,
      Cell: ({
        cell: {
          row: { original },
        },
      }) => {
        const api = original;
        return (
          <div className="btn-group">
            <Link
              rel="noopener"
              to={`/${props.currentTeam._humanReadableId}/${api._humanReadableId}/${api.currentVersion}`}
              className="btn btn-sm btn-access-negative"
              title="View this Api">
              <i className="fas fa-eye" />
            </Link>
            {api.published && (
              <Can I={read} a={stat} team={props.currentTeam}>
                <Link
                  key={`consumption-${api._humanReadableId}`}
                  to={`/${props.currentTeam._humanReadableId}/settings/consumptions/apis/${api._humanReadableId}/${api.currentVersion}`}
                  className="btn btn-sm btn-access-negative"
                  title={translateMethod('View this api consumption')}>
                  <i className="fas fa-chart-bar" />
                </Link>
              </Can>
            )}
            {api.published && (
              <Can I={manage} a={API} team={props.currentTeam}>
                <Link
                  key={`apikeys-${api._humanReadableId}`}
                  to={`/${props.currentTeam._humanReadableId}/settings/subscriptions/apis/${api._humanReadableId}/${api.currentVersion}`}
                  className="btn btn-sm btn-access-negative"
                  title={translateMethod('View this api subscriptions')}>
                  <i className="fas fa-key" />
                </Link>
              </Can>
            )}
            <Can I={manage} a={API} team={props.currentTeam}>
              <Link
                key={`edit-${api._humanReadableId}`}
                to={`/${props.currentTeam._humanReadableId}/settings/apis/${api._humanReadableId}/${api.currentVersion}/infos`}
                className="btn btn-sm btn-access-negative"
                title="Edit this Api">
                <i className="fas fa-edit" />
              </Link>
              {api.visibility !== 'AdminOnly' && (
                <button
                  key={`delete-${api._humanReadableId}`}
                  type="button"
                  className="btn btn-sm btn-access-negative"
                  title="Delete this Api"
                  onClick={() => deleteApi (api)}>
                  <i className="fas fa-trash" />
                </button>
              )}
            </Can>
          </div>
        );
      },
    },
  ];

  const togglePublish = (api) => {
    Services.saveTeamApi(props.currentTeam._id, {
      ...api,
      published: !api.published,
    }).then(() => table.update());
  };

  const deleteApi = (api) => {
    window
      .confirm(
        translateMethod(
          'delete.api.confirm',
          false,
          'Are you sure you want to delete this api ?'
        )
      )
      .then((ok) => {
        if (ok) {
          Services.deleteTeamApi(props.currentTeam._id, api._id).then(() => {
            toastr.success(
              translateMethod(
                'delete.api.success',
                false,
                'API deleted successfully',
                api.name
              )
            );
            table.update();
          });
        }
      });
  };

  const createNewApi = () => {
    Services.fetchNewApi()
      .then((e) => {
        const verb = faker.hacker.verb();
        const apiName =
          verb.charAt(0).toUpperCase() +
          verb.slice(1) +
          ' ' +
          faker.hacker.adjective() +
          ' ' +
          faker.hacker.noun() +
          ' api';

        e.name = apiName;
        e._humanReadableId = apiName.replace(/\s/gi, '-').toLowerCase().trim();
        return e;
      })
      .then((newApi) => {
        props.history.push(
          `/${props.currentTeam._humanReadableId}/settings/apis/${newApi._id}/infos`,
          { newApi: { ...newApi, team: props.currentTeam._id } }
        );
      });
  };

  if (props.tenant.creationSecurity && !props.currentTeam.apisCreationPermission) {
    props.setError({ error: { status: 403, message: 'unauthorized' } });
  }
  return (
    <TeamBackOffice
      tab="Apis"
      apiId={props.match.params.apiId}
      title={`${props.currentTeam.name} - ${translateMethod('API', true)}`}>
      <Can I={read} a={API} dispatchError={true} team={props.currentTeam}>
        <div className="row">
          <div className="col">
            <h1>
              <Translation i18nkey="Team apis">
                Team APIs
              </Translation>
              {props.apiCreationPermitted && props.currentTeam.type !== 'Admin' && (
                <Can I={manage} a={API} team={props.currentTeam}>
                  <a
                    className="btn btn-sm btn-access-negative mb-1 ml-1"
                    title={translateMethod('Create a new API')}
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      createNewApi();
                    }}>
                    <i className="fas fa-plus-circle" />
                  </a>
                </Can>
              )}
            </h1>
            <div className="p-2">
              <Table
                selfUrl="apis"
                defaultTitle="Team Apis"
                defaultValue={() => ({})}
                defaultSort="name"
                itemName="api"
                columns={columns}
                fetchItems={() => Services.teamApis(props.currentTeam._id)}
                showActions={false}
                showLink={false}
                extractKey={(item) => item._id}
                injectTable={(t) => (table = t)}
              />
            </div>
          </div>
        </div>
      </Can>
    </TeamBackOffice>
  );
}

const mapStateToProps = (state) => ({
  ...state.context,
});

const mapDispatchToProps = {
  setError: (error) => setError(error),
};

export const TeamApis = connect(mapStateToProps, mapDispatchToProps)(TeamApisComponent);
