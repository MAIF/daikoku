/* eslint-disable react/jsx-no-target-blank */
import { BooleanInput } from '@maif/react-forms';
import { useContext, useRef, useState } from 'react';
import { Download, Upload } from "lucide-react";

import { useDaikokuBackOffice } from '../../../contexts';
import { I18nContext } from '../../../contexts/i18n-context';
import * as Services from '../../../services';
import { Can, daikoku, manage } from '../../utils';

export const ImportExport = () => {
  useDaikokuBackOffice();

  const { translate, Translation } = useContext(I18nContext);

  const inputRef = useRef<HTMLInputElement>(null)

  const [uploading, setUploading] = useState(false);
  const [exportAuditTrail, setExportAuditTrail] = useState(true);

  const importState = () => {
    if (inputRef.current) {
      inputRef.current.click();
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
              className="btn btn-outline-info"
            >
              <Download className="me-1" />
              <Translation i18nkey="download state">download state</Translation>
            </a>
            <button
              type="button"
              style={{ marginLeft: 10 }}
              onClick={importState}
              className="btn btn-outline-info"
            >
              <Upload className="me-1" />
              {uploading ? translate('importing ...') : translate('import state')}
            </button>
            <div className="d-flex justify-content-start align-items-center mt-2">
              <label className="me-3">{translate('audittrail.export.label')}</label>
              <BooleanInput onChange={setExportAuditTrail} value={exportAuditTrail} />
            </div>
            <input
              type="file"
              className="hide"
              ref={inputRef}
              onChange={actuallyImportState}
            />
          </div>
        </div>
      </div>
    </Can>
  );
};
