import React, { Component } from 'react';
import * as Services from '../../../services';
import { UserBackOffice } from '../../backoffice';
import { connect } from 'react-redux';
import { Can, manage, daikoku } from '../../utils';
import { t, Translation } from '../../../locales';

export class ImportExportComponent extends Component {
  state = { uploading: false };

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

  render() {
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
              <a
                href="/api/state/export?download=true"
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
              <input
                type="file"
                className="hide"
                ref={(r) => (this.input = r)}
                onChange={this.actuallyImportState}
              />
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
