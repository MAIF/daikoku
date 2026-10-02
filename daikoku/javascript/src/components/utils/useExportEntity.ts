import { format, type } from '@maif/react-forms';
import { useContext } from 'react';

import { I18nContext, ModalContext } from '../../contexts';
import { GlobalContext } from '../../contexts/globalContext';

export type ExportedKind = 'team' | 'usage-plan' | 'api' | 'keyring' | 'api-subscription' | 'cms-page';

type ExportOptions = { children: boolean; format: 'yaml' | 'zip' };

const KINDS_WITH_CHILDREN: Array<ExportedKind> = ['team', 'usage-plan', 'api', 'keyring'];

export const useExportEntity = () => {
  const { tenant, isTenantAdmin } = useContext(GlobalContext);
  const { translate } = useContext(I18nContext);
  const { openFormModal } = useContext(ModalContext);

  // a plain navigation lets the browser stream the file to disk
  const download = (kind: ExportedKind, id: string, options: ExportOptions) => {
    const fileFormat = options.children ? options.format : 'yaml';
    const query = new URLSearchParams({
      kind,
      id,
      children: String(options.children),
      format: fileFormat,
    });

    window.location.assign(`/api/tenants/${tenant._id}/remote-catalogs/_export?${query}`);
  };

  const chooseOptions = (kind: ExportedKind, id: string) =>
    openFormModal<ExportOptions>({
      title: translate('remote-catalog.exportEntity.modal'),
      schema: {
        children: {
          type: type.bool,
          label: translate('remote-catalog.exportEntity.label.children'),
          help: translate(`remote-catalog.exportEntity.help.children.${kind}`),
          defaultValue: false,
        },
        format: {
          type: type.string,
          format: format.select,
          label: translate('remote-catalog.exportEntity.label.format'),
          options: [
            { label: translate('remote-catalog.exportEntity.format.yaml'), value: 'yaml' },
            { label: translate('remote-catalog.exportEntity.format.zip'), value: 'zip' },
          ],
          visible: ({ rawValues }) => rawValues.children,
          defaultValue: 'yaml',
        },
      },
      value: { children: false, format: 'yaml' },
      onSubmit: (options) => download(kind, id, options),
      actionLabel: translate('remote-catalog.modal.exportBtn'),
    });

  const exportEntity = (kind: ExportedKind, id: string) => {
    if (KINDS_WITH_CHILDREN.includes(kind)) {
      chooseOptions(kind, id);
    } else {
      download(kind, id, { children: false, format: 'yaml' });
    }
  };

  return { canExport: isTenantAdmin, exportEntity };
};
