/* eslint-disable react/jsx-no-target-blank */
import React, { Component } from 'react';
import * as Services from '../../../services';
import { UserBackOffice } from '../../backoffice';
import { connect } from 'react-redux';
import { Can, manage, daikoku } from '../../utils';
import { t, Translation } from '../../../locales';
import { SwitchButton } from '../../inputs';

export class ImportExportComponent extends Component {
  state = {
    exportAuditTrail: true,
    uploading: false,
    migration: {
      processing: false,
      error: '',
      onSuccessMessage: '',
    },
  };

  importState = () => {
    if (this.input) {
      this.input.click();
    }
  };

  actuallyImportState = (e) => {
    const files = e.target.files;
    this.setState({ uploading: true }, () => {
      Services.uploadExportFile(files[0]).then(() => {
        this.setState({ uploading: false });
        window.location.reload();
      });
    });
  };

  migrate = () => {
    this.setState(
      {
        migration: {
          processing: true,
          error: '',
          onSuccessMessage: '',
        },
      },
      () => {
        Services.migrateMongoToPostgres().then(async (res) => {
          this.setState({
            migration: {
              processing: false,
              error: res.error || '',
              onSuccessMessage: res.error ? '' : res.message,
            },
          });
        });
      }
    );
  };

  render() {
    const { processing, error, onSuccessMessage } = this.state.migration;
    return (
      <UserBackOffice tab="Import / Export">
        <Can I={manage} a={daikoku} dispatchError>
          <div className="row">
            <div className="col">
              <h1>
                <Translation i18nkey="Import / Export" language={this.props.currentLanguage}>
                  Import / Export
                </Translation>
              </h1>
              <div className="section p-3">
                <a
                  href={`/api/state/export?download=true&export-audit-trail=${!!this.state
                    .exportAuditTrail}`}
                  target="_blank"
                  className="btn btn-outline-primary">
                  <i className="fas fa-download mr-1" />
                  <Translation i18nkey="download state" language={this.props.currentLanguage}>
                    download state
                  </Translation>
                </a>
                <button
                  type="button"
                  style={{ marginLeft: 10 }}
                  onClick={this.importState}
                  className="btn btn-outline-primary">
                  <i className="fas fa-upload mr-1" />
                  {this.state.uploading
                    ? t('importing ...', this.props.currentLanguage)
                    : t('import state', this.props.currentLanguage)}
                </button>
                <div className="d-flex justify-content-start">
                  <SwitchButton
                    onSwitch={(enabled) => this.setState({ exportAuditTrail: enabled })}
                    checked={this.state.exportAuditTrail}
                    label={t('audittrail.export.label', this.props.currentLanguage)}
                  />
                </div>
                <input
                  type="file"
                  className="hide"
                  ref={(r) => (this.input = r)}
                  onChange={this.actuallyImportState}
                />
              </div>
              <h2 className="my-2">
                <Translation i18nkey="Mongo migration" language={this.props.currentLanguage}>
                  Mongo migration
                </Translation>
              </h2>
              <div className="section p-3">
                <button type="button" onClick={this.migrate} className="btn btn-outline-primary">
                  <i className="fas fa-database mr-1" />
                  {processing
                    ? t('migration in progress ...', this.props.currentLanguage)
                    : t('migrate database', this.props.currentLanguage)}
                </button>
                {error.length > 0 && (
                  <div className="alert alert-danger my-0 mt-3" role="alert">
                    {error}
                  </div>
                )}
                {onSuccessMessage.length > 0 && (
                  <div className="alert alert-success my-0 mt-3" role="alert">
                    {onSuccessMessage}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Can>
      </UserBackOffice>
    );
  }
}

const mapStateToProps = (state) => ({
  ...state.context,
});

export const ImportExport = connect(mapStateToProps)(ImportExportComponent);
