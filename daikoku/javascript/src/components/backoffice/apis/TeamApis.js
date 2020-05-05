import React, { Component } from 'react';
import { Link } from 'react-router-dom';
import { connect } from 'react-redux';
import { toastr } from 'react-redux-toastr';
import faker from 'faker';

import * as Services from '../../../services';
import { Can, read, manage, stat, api as Api, administrator } from '../../utils';
import { TeamBackOffice } from '../..';
import { Table, SwitchButton } from '../../inputs';
import { t } from '../../../locales';

class TeamApisComponent extends Component {
  columns = [
    {
      title: t('Name', this.props.currentLanguage),
      style: { textAlign: 'left', alignItems: 'center', display: 'flex' },
      content: api => api.name,
    },
    {
      title: t('Description', this.props.currentLanguage),
      style: { textAlign: 'left', alignItems: 'center', display: 'flex' },
      content: api => api.smallDescription,
    },
    {
      title: t('Published', this.props.currentLanguage),
      style: { justifyContent: 'center', width: 100, alignItems: 'center', display: 'flex' },
      content: api => (api.published ? 'yes' : 'no'),
      cell: (a, api) => (
        <Can I={manage} a={Api} team={this.props.currentTeam}>
          <SwitchButton
            onSwitch={() => this.togglePublish(api)}
            checked={api.published}
            disabled={api.visibility === 'AdminOnly'}
            large
            noText
          />
        </Can>
      ),
    },
    {
      title: t('Actions', this.props.currentLanguage),
      style: { textAlign: 'center', width: 180, alignItems: 'center', display: 'flex' },
      notFilterable: true,
      content: item => item._id,
      cell: (a, api) => (
        <div className="btn-group">
          <Link
            rel="noopener"
            to={`/${this.props.currentTeam._humanReadableId}/${api._humanReadableId}`}
            className="btn btn-sm btn-access-negative"
            title="View this Api">
            <i className="fas fa-eye" />
          </Link>
          {api.published && (
            <Can I={read} a={stat} team={this.props.currentTeam}>
              <Link
                key={`consumption-${api._humanReadableId}`}
                to={`/${this.props.currentTeam._humanReadableId}/settings/consumptions/apis/${api._humanReadableId}`}
                className="btn btn-sm btn-access-negative"
                title={t('View this api consumption', this.props.currentLanguage)}>
                <i className="fas fa-chart-bar" />
              </Link>
            </Can>
          )}
          <Can I={manage} a={Api} team={this.props.currentTeam}>
            <Link
              key={`edit-${api._humanReadableId}`}
              to={`/${this.props.currentTeam._humanReadableId}/settings/apis/${api._humanReadableId}/infos`}
              className="btn btn-sm btn-access-negative"
              title="Edit this Api">
              <i className="fas fa-edit" />
            </Link>
            {api.visibility !== 'AdminOnly' && <button
              key={`delete-${api._humanReadableId}`}
              type="button"
              className="btn btn-sm btn-access-negative"
              title="Delete this Api"
              onClick={() => this.delete(api)}>
              <i className="fas fa-trash" />
            </button>}
          </Can>
        </div>
      ),
    },
  ];

  togglePublish = api => {
    Services.saveTeamApi(this.props.currentTeam._id, {
      ...api,
      published: !api.published,
    }).then(() => this.table.update());
  };

  isTeamAdmin = user => {
    return Option(this.props.currentTeam.users.find(u => u.userId === user._id))
      .map(user => user.teamPermission)
      .fold(
        () => false,
        perm => perm === administrator
      );
  };

  delete = api => {
    window.confirm(t(
      'delete.api.confirm',
      this.props.currentLanguage,
      'Are you sure you want to delete this api ?'
    ))
      .then(ok => {
        if (ok) {
          Services.deleteTeamApi(this.props.currentTeam._id, api._id)
            .then(() => {
              toastr.success(t('delete.api.success', this.props.currentLanguage, false, 'API deleted successfully', api.name));
              this.table.update();
            });
        }
      });
  };

  createNewApi = () => {
    Services.fetchNewApi()
      .then(e => {
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
        e._humanReadableId = apiName
          .replace(/\s/gi, '-')
          .toLowerCase()
          .trim();
        return e;
      })
      .then(newApi => {
        this.props.history.push(
          `/${this.props.currentTeam._humanReadableId}/settings/apis/${newApi._id}/infos`,
          { newApi: { ...newApi, team: this.props.currentTeam._id } }
        );
      });
  };

  render() {
    return (
      <TeamBackOffice tab="Apis" apiId={this.props.match.params.apiId}>
        <Can I={read} a={Api} dispatchError={true} team={this.props.currentTeam}>
          <div className="row">
            <div className="col">
              <h1>
                Team apis
                {this.props.currentTeam.type !== 'Admin' && <Can I={manage} a={Api} team={this.props.currentTeam}>
                  <a
                    className="btn btn-sm btn-access-negative mb-1 ml-1"
                    title={t('Create a new API', this.props.currentLanguage)}
                    href="#"
                    onClick={e => {
                      e.preventDefault();
                      this.createNewApi();
                    }}>
                    <i className="fas fa-plus-circle" />
                  </a>
                </Can>}
              </h1>
              <div className="section p-2">
                <Table
                  currentLanguage={this.props.currentLanguage}
                  selfUrl="apis"
                  defaultTitle="Team Apis"
                  defaultValue={() => ({})}
                  itemName="api"
                  columns={this.columns}
                  fetchItems={() => Services.teamApis(this.props.currentTeam._id)}
                  showActions={false}
                  showLink={false}
                  extractKey={item => item._id}
                  injectTable={t => (this.table = t)}
                />
              </div>
            </div>
          </div>
        </Can>
      </TeamBackOffice>
    );
  }
}

const mapStateToProps = state => ({
  ...state.context,
});

export const TeamApis = connect(mapStateToProps)(TeamApisComponent);
