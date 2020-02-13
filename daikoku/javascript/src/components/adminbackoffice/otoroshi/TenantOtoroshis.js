import React, { Component } from 'react';
import { Link } from 'react-router-dom';
import { connect } from 'react-redux';
import uuid from 'uuid/v4';
import faker from 'faker';

import * as Services from '../../../services';
import { Table } from '../../inputs';
import { UserBackOffice } from '../../backoffice';
import { Can, manage, daikoku, administrator } from '../../utils';
import { t, Translation } from '../../../locales';

export class TenantOtoroshisComponent extends Component {
  state = {
    otoroshis: [],
  };

  columns = [
    {
      title: t('Url', this.props.currentLanguage),
      style: { textAlign: 'left', alignItems: 'center', display: 'flex' },
      content: item => item.url,
    },
    {
      title: t('Host', this.props.currentLanguage),
      style: { textAlign: 'left', alignItems: 'center', display: 'flex' },
      content: item => item.host,
    },
    {
      title: t('Actions', this.props.currentLanguage),
      style: { textAlign: 'center', width: 100, alignItems: 'center', display: 'flex' },
      notFilterable: true,
      content: item => item._id,
      cell: (a, otoroshi) => (
        <div className="btn-group">
          {this.isTeamAdmin() && (
            <Link to={`/settings/otoroshis/${otoroshi._id}`}>
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                title={t("Edit this settings", this.props.currentLanguage)}>
                <i className="fas fa-edit" />
              </button>
            </Link>
          )}
          {this.isTeamAdmin() && (
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
              title={t("Delete this settings", this.props.currentLanguage)}
              onClick={() => this.delete(otoroshi._id)}>
              <i className="fas fa-trash" />
            </button>
          )}
        </div>
      ),
    },
  ];

  isTeamAdmin = () => {
    if (this.props.connectedUser.isDaikokuAdmin) {
      return true;
    }
    return (
      this.props.currentTeam.users
        .filter(u => u.teamPermission === administrator)
        .indexOf(this.props.connectedUser._id) > -1
    );
  };

  delete = id => {
    window.confirm(t("otoroshi.settings.delete.confirm", this.props.currentLanguage, false, 'Are you sure you want to delete those otoroshi settings ?'))
      .then(ok => {
        if (ok) {
          Services.deleteOtoroshiSettings(id);
        }
      });
  };

  createNewSettings = () => {
    const settings = {
      _id: uuid(),
      url: 'https://otoroshi-api.foo.bar',
      host: 'otoroshi-api.foo.bar',
      clientId: faker.random.alphaNumeric(16),
      clientSecret: faker.random.alphaNumeric(64),
    };
    this.props.history.push(`/settings/otoroshis/${settings._id}`, { newSettings: settings });
  };

  render() {
    return (
      <UserBackOffice tab="Otoroshi">
        <Can I={manage} a={daikoku} dispatchError>
          <div className="row">
            <div className="col">
              <h1>
                <Translation i18nkey="Otoroshi settings" language={this.props.currentLanguage}>Otoroshi settings</Translation>
                <a
                  className="btn btn-sm btn-access-negative mb-1 ml-1"
                  title={t("Create new settings", this.props.currentLanguage)}
                  href="#"
                  onClick={e => {
                    e.preventDefault();
                    this.createNewSettings();
                  }}>
                  <i className="fas fa-plus-circle" />
                </a>
              </h1>
              <div className="section p-2">
                <Table
                  currentLanguage={this.props.currentLanguage}
                  selfUrl="otoroshis"
                  defaultTitle="Otoroshi instances"
                  defaultValue={() => ({})}
                  itemName="otoroshi"
                  columns={this.columns}
                  fetchItems={() => Services.allOtoroshis()}
                  showActions={false}
                  showLink={false}
                  extractKey={item => item._id}
                />
              </div>
            </div>
          </div>
        </Can>
      </UserBackOffice>
    );
  }
}

const mapStateToProps = state => ({
  ...state.context,
});

export const TenantOtoroshis = connect(mapStateToProps)(TenantOtoroshisComponent);
