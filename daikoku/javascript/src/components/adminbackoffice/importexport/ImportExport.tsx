/* eslint-disable react/jsx-no-target-blank */
import React, { useContext, useState } from 'react';
import { BooleanInput } from '@maif/react-forms';

import * as Services from '../../../services';
import { Can, manage, daikoku } from '../../utils';
import { I18nContext } from '../../../locales/i18n-context';
import { useDaikokuBackOffice } from '../../../contexts';

export const ImportExport = () => {
  useDaikokuBackOffice();

    const { translateMethod, Translation } = useContext(I18nContext);

  let input: any;

  const [uploading, setUploading] = useState(false);
  const [exportAuditTrail, setExportAuditTrail] = useState(true);
  const [migration, setMigration] = useState({
    processing: false,
    error: '',
    onSuccessMessage: '',
  });

  const importState = () => {
    if (input) {
      input.click();
    }
  };

  const actuallyImportState = (e: any) => {
    const files = e.target.files;
    setUploading(true);
    Services.uploadExportFile(files[0]).then(() => {
      setUploading(false);
      window.location.reload();
    });
  };

  const migrate = () => {
    setMigration({
      processing: true,
      error: '',
      onSuccessMessage: '',
    });
    Services.migrateMongoToPostgres().then((res) =>
      setMigration({
        processing: false,
        error: res.error || '',
        onSuccessMessage: res.error ? '' : res.message,
      })
    );
  };

  const { processing, error, onSuccessMessage } = migration;
  return (
        <Can I={manage} a={daikoku} dispatchError>
            <div className="row">
                <div className="col">
                    <h1>
                        <Translation i18nkey="Import / Export">Import / Export</Translation>
          </h1>
                    <div className="section p-3">
                        <a
              href={`/api/state/export?download=true&export-audit-trail=${!!exportAuditTrail}`}
              target="_blank"
              className="btn btn-outline-primary"
            >
                            <i className="fas fa-download me-1" />
                            <Translation i18nkey="download state">download state</Translation>
            </a>
                        <button
              type="button"
              style={{ marginLeft: 10 }}
              onClick={importState}
              className="btn btn-outline-primary"
            >
                            <i className="fas fa-upload me-1" />
              {uploading ? translateMethod('importing ...') : translateMethod('import state')}
            </button>
                        <div className="d-flex justify-content-start align-items-center mt-2">
                            <label className="me-3">{translateMethod('audittrail.export.label')}</label>
                            <BooleanInput onChange={setExportAuditTrail} value={exportAuditTrail} />
            </div>
                        <input
              type="file"
              className="hide"
              ref={(r) => (input = r)}
              onChange={actuallyImportState}
            />
          </div>
                    <h2 className="my-2">
                        <Translation i18nkey="Mongo migration">Mongo migration</Translation>
          </h2>
                    <div className="section p-3">
                        <button type="button" onClick={migrate} className="btn btn-outline-primary">
                            <i className="fas fa-database me-1" />
              {processing
                ? translateMethod('migration in progress ...')
                : translateMethod('migrate database')}
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
  );
};
