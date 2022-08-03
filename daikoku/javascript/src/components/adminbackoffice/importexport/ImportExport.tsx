/* eslint-disable react/jsx-no-target-blank */
import React, { useContext, useState } from 'react';
import { BooleanInput } from '@maif/react-forms';

import * as Services from '../../../services';
import { Can, manage, daikoku } from '../../utils';
// @ts-expect-error TS(6142): Module '../../../locales/i18n-context' was resolve... Remove this comment to see the full error message
import { I18nContext } from '../../../locales/i18n-context';
import { useDaikokuBackOffice } from '../../../contexts';

export const ImportExport = () => {
  useDaikokuBackOffice();

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
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
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Can I={manage} a={daikoku} dispatchError>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="row">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="col">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <h1>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Translation i18nkey="Import / Export">Import / Export</Translation>
          </h1>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="section p-3">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <a
              href={`/api/state/export?download=true&export-audit-trail=${!!exportAuditTrail}`}
              target="_blank"
              className="btn btn-outline-primary"
            >
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <i className="fas fa-download me-1" />
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Translation i18nkey="download state">download state</Translation>
            </a>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <button
              type="button"
              style={{ marginLeft: 10 }}
              onClick={importState}
              className="btn btn-outline-primary"
            >
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <i className="fas fa-upload me-1" />
              {uploading ? translateMethod('importing ...') : translateMethod('import state')}
            </button>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="d-flex justify-content-start align-items-center mt-2">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <label className="me-3">{translateMethod('audittrail.export.label')}</label>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <BooleanInput onChange={setExportAuditTrail} value={exportAuditTrail} />
            </div>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <input
              type="file"
              className="hide"
              ref={(r) => (input = r)}
              onChange={actuallyImportState}
            />
          </div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <h2 className="my-2">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Translation i18nkey="Mongo migration">Mongo migration</Translation>
          </h2>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="section p-3">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <button type="button" onClick={migrate} className="btn btn-outline-primary">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <i className="fas fa-database me-1" />
              {processing
                ? translateMethod('migration in progress ...')
                : translateMethod('migrate database')}
            </button>
            {error.length > 0 && (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <div className="alert alert-danger my-0 mt-3" role="alert">
                {error}
              </div>
            )}
            {onSuccessMessage.length > 0 && (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
