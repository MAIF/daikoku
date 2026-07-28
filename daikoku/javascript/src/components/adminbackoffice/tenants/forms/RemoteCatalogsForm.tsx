import { constraints, format, Schema, type } from '@maif/react-forms';
import { UseMutationResult, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { nanoid } from 'nanoid';
import { useContext, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { I18nContext, ModalContext } from '../../../../contexts';
import * as Services from '../../../../services';
import {
  IRemoteCatalog,
  IRemoteCatalogConfig,
  ITenantFull,
  RemoteCatalogSourceKind,
} from '../../../../types';
import { Table, TableRef } from '../../../inputs/Table';
import { Can, manage, tenant as TENANT } from '../../../utils';
import { formatDate } from '../../../utils/formatters';

const SOURCE_KINDS: Array<RemoteCatalogSourceKind> = ['file', 'http', 'github', 'gitlab'];
const ENTITY_KINDS = ['team', 'usage-plan', 'api', 'api-subscription', 'cms-page'];

const emptyCatalog = (): Partial<IRemoteCatalog> => ({
  name: '',
  enabled: true,
  source: { kind: 'http', config: {} as any },
  scheduling: { enabled: false, mode: 'interval' },
  allowedKinds: [],
});

export const RemoteCatalogsForm = (props: {
  tenant: ITenantFull;
  updateTenant: UseMutationResult<any, unknown, ITenantFull, unknown>;
}) => {
  const table = useRef<TableRef>(undefined);

  const { translate } = useContext(I18nContext);
  const { openFormModal, confirm, alert } = useContext(ModalContext);
  const queryClient = useQueryClient();

  const configQuery = useQuery({
    queryKey: ['remote-catalog-config', props.tenant._id],
    queryFn: () => Services.getRemoteCatalogConfig(props.tenant._id) as Promise<IRemoteCatalogConfig>,
  });
  const defaultInterval = configQuery.data?.defaultInterval ?? 60000;

  useEffect(() => {
    table.current?.update();
  }, [props.tenant.remoteCatalogs]);

  const persist = (remoteCatalogs: Array<IRemoteCatalog>) =>
    props.updateTenant
      .mutateAsync({ ...props.tenant, remoteCatalogs })
      .then(() => queryClient.invalidateQueries({ queryKey: ['full-tenant'] }))
      .then(() => table.current?.update());

  const formatAt = (at: any): string => {
    const ts = typeof at === 'object' && at !== null ? at.$long : at;
    if (!ts) return '';
    return formatDate(ts, translate('date.locale'), translate('date.format'));
  };

  const ReportView = ({ report }: { report: any }) => (
    <div className="mt-3">
      {report.timestamp && (
        <div className="text-muted mb-2">{formatAt(Date.parse(report.timestamp) || report.timestamp)}</div>
      )}
      <table className="table table-sm align-middle mb-0">
        <thead>
          <tr>
            <th>{translate('remote-catalog.label.kind')}</th>
            <th className="text-center">{translate('remote-catalog.col.created')}</th>
            <th className="text-center">{translate('remote-catalog.col.updated')}</th>
            <th className="text-center">{translate('remote-catalog.col.deleted')}</th>
            <th>{translate('remote-catalog.col.errors')}</th>
          </tr>
        </thead>
        <tbody>
          {(report.results ?? []).map((res: any, i: number) => (
            <tr key={i}>
              <td><span className="badge bg-secondary">{res.kind}</span></td>
              <td className="text-center text-success">{res.created}</td>
              <td className="text-center text-info">{res.updated}</td>
              <td className="text-center text-warning">{res.deleted}</td>
              <td className="text-danger small">
                {(res.errors ?? []).length === 0 ? '—' : (res.errors ?? []).join(', ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const run = (label: string, fn: () => Promise<any>) =>
    fn().then((r) => {
      if (r?.error) {
        toast.error(r.error);
      } else {
        toast.success(translate('Done'));
        alert({ title: label, message: <ReportView report={r} /> });
      }
    });

  const showHistory = (catalog: IRemoteCatalog) =>
    Services.getRemoteCatalogHistory(props.tenant._id, catalog.id).then((runs: Array<any>) =>
      alert({
        title: `${catalog.name} — ${translate('remote-catalog.action.history')}`,
        message:
          !runs || runs.length === 0 ? (
            <div className="mt-3">{translate('remote-catalog.noRun')}</div>
          ) : (
            <table className="table table-sm align-middle mt-3 mb-0">
              <thead>
                <tr>
                  <th>{translate('remote-catalog.col.date')}</th>
                  <th className="text-center">{translate('remote-catalog.col.created')}</th>
                  <th className="text-center">{translate('remote-catalog.col.updated')}</th>
                  <th className="text-center">{translate('remote-catalog.col.deleted')}</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r, i) => (
                  <tr key={i}>
                    <td>{formatAt(r.at)}</td>
                    <td className="text-center text-success">{(r.created ?? []).length}</td>
                    <td className="text-center text-info">{(r.updated ?? []).length}</td>
                    <td className="text-center text-warning">{(r.deleted ?? []).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ),
      })
    );

  const catalogSchema = (): Schema => ({
    name: {
      type: type.string,
      label: translate('remote-catalog.label.name'),
      constraints: [constraints.required(translate('remote-catalog.constraint.name'))],
    },
    enabled: { type: type.bool, label: translate('remote-catalog.label.enabled'), defaultValue: true },
    source: {
      type: type.object,
      format: format.form,
      label: translate('remote-catalog.label.source'),
      schema: {
        kind: {
          type: type.string,
          format: format.buttonsSelect,
          label: translate('remote-catalog.label.kind'),
          defaultValue: 'http',
          options: SOURCE_KINDS,
          constraints: [constraints.required(translate('remote-catalog.constraint.kind'))],
        },
        config: {
          type: type.object,
          format: format.form,
          label: translate('remote-catalog.label.config'),
          schema: {
            // --- file ---
            path: {
              type: type.string,
              label: translate('remote-catalog.label.path'),
              help: translate('remote-catalog.help.path'),
              visible: ({ rawValues }) => rawValues.source.kind !== 'http',
              constraints: [
                constraints.when(
                  'source.kind',
                  (k) => k === 'file',
                  [constraints.required(translate('remote-catalog.constraint.path'))]
                ),
              ],
            },
            pre_command: {
              type: type.string,
              array: true,
              label: translate('remote-catalog.label.preCommand'),
              help: translate('remote-catalog.help.preCommand'),
              placeholder: 'aws',
              visible: ({ rawValues }) => rawValues.source.kind === 'file',
            },
            // --- http ---
            url: {
              type: type.string,
              label: translate('remote-catalog.label.url'),
              visible: ({ rawValues }) => rawValues.source.kind === 'http',
              constraints: [
                constraints.when(
                  'source.kind',
                  (k) => k === 'http',
                  [constraints.required(translate('remote-catalog.constraint.url'))]
                ),
              ],
            },
            headers: {
              type: type.object,
              label: translate('remote-catalog.label.headers'),
              visible: ({ rawValues }) => rawValues.source.kind === 'http',
            },
            timeout: {
              type: type.number,
              label: translate('remote-catalog.label.timeout'),
              defaultValue: 30000,
              visible: ({ rawValues }) => rawValues.source.kind === 'http',
            },
            // --- github / gitlab ---
            repo: {
              type: type.string,
              label: translate('remote-catalog.label.repo'),
              help: translate('remote-catalog.help.repo'),
              visible: ({ rawValues }) =>
                rawValues.source.kind === 'github' || rawValues.source.kind === 'gitlab',
              constraints: [
                constraints.when(
                  'source.kind',
                  (k) => k === 'github' || k === 'gitlab',
                  [constraints.required(translate('remote-catalog.constraint.repo'))]
                ),
              ],
            },
            branch: {
              type: type.string,
              label: translate('remote-catalog.label.branch'),
              placeholder: 'main',
              visible: ({ rawValues }) =>
                rawValues.source.kind === 'github' || rawValues.source.kind === 'gitlab',
            },
            token: {
              type: type.string,
              format: format.password,
              label: translate('remote-catalog.label.token'),
              help: translate('remote-catalog.help.token'),
              visible: ({ rawValues }) =>
                rawValues.source.kind === 'github' || rawValues.source.kind === 'gitlab',
            },
            base_url: {
              type: type.string,
              label: translate('remote-catalog.label.baseUrl'),
              help: translate('remote-catalog.help.baseUrl'),
              visible: ({ rawValues }) =>
                rawValues.source.kind === 'github' || rawValues.source.kind === 'gitlab',
            },
            repo_patterns: {
              type: type.string,
              array: true,
              label: translate('remote-catalog.label.repoPatterns'),
              help: translate('remote-catalog.help.repoPatterns'),
              visible: ({ rawValues }) =>
                rawValues.source.kind === 'github' || rawValues.source.kind === 'gitlab',
            },
          },
        },
      },
    },
    scheduling: {
      type: type.object,
      format: format.form,
      label: translate('remote-catalog.label.scheduling'),
      schema: {
        enabled: {
          type: type.bool,
          label: translate('remote-catalog.label.enableScheduling'),
          defaultValue: false,
        },
        mode: {
          type: type.string,
          format: format.buttonsSelect,
          label: translate('remote-catalog.label.mode'),
          defaultValue: 'interval',
          options: ['interval', 'cron'],
          visible: ({ rawValues }) => rawValues.scheduling.enabled,
        },
        interval: {
          type: type.number,
          label: translate('remote-catalog.label.interval'),
          placeholder: `${defaultInterval}`,
          visible: ({ rawValues }) =>
            rawValues.scheduling.enabled && rawValues.scheduling.mode === 'interval',
        },
        cronExpression: {
          type: type.string,
          label: translate('remote-catalog.label.cron'),
          visible: ({ rawValues }) =>
            rawValues.scheduling.enabled && rawValues.scheduling.mode === 'cron',
          render: ({ value, onChange }: any) => (
            <div className="flex-grow-1">
              <input
                className="mrf-input"
                value={value ?? ''}
                placeholder="*/5 * * * * ?"
                onChange={onChange}
              />
              <div className="text-muted small mt-1" style={{ whiteSpace: 'pre-line' }}>
                {translate('remote-catalog.help.cron')}
              </div>
            </div>
          ),
        },
      },
    },
    allowedKinds: {
      type: type.string,
      array: true,
      format: format.select,
      isMulti: true,
      label: translate('remote-catalog.label.allowedKinds'),
      help: translate('remote-catalog.help.allowedKinds'),
      options: ENTITY_KINDS,
    },
  });

  const editCatalog = (catalog?: IRemoteCatalog) =>
    openFormModal<IRemoteCatalog>({
      title: catalog ? translate('remote-catalog.modal.edit') : translate('remote-catalog.modal.create'),
      schema: catalogSchema(),
      value: catalog ?? (emptyCatalog() as IRemoteCatalog),
      onSubmit: (data) => {
        const saved: IRemoteCatalog = {
          ...data,
          id: catalog?.id ?? nanoid(32),
        };
        const remoteCatalogs = catalog
          ? props.tenant.remoteCatalogs.map((c) => (c.id === saved.id ? saved : c))
          : [...(props.tenant.remoteCatalogs ?? []), saved];
        persist(remoteCatalogs);
      },
      actionLabel: catalog
        ? translate('remote-catalog.modal.updateBtn')
        : translate('remote-catalog.modal.createBtn'),
    });

  const deleteCatalog = (catalog: IRemoteCatalog) =>
    confirm({
      message: translate({ key: 'remote-catalog.deleteConfirm', replacements: [catalog.name] }),
      okLabel: translate('remote-catalog.action.delete'),
    }).then((ok) => {
      if (ok) {
        persist((props.tenant.remoteCatalogs ?? []).filter((c) => c.id !== catalog.id));
      }
    });

  const columnHelper = createColumnHelper<IRemoteCatalog>();
  const columns = [
    columnHelper.accessor('name', { header: translate('remote-catalog.label.name') }),
    columnHelper.accessor('source.kind', {
      header: translate('remote-catalog.label.source'),
      cell: (info) => <span className="badge bg-secondary">{info.getValue()}</span>,
    }),
    columnHelper.accessor('enabled', {
      header: translate('remote-catalog.label.enabled'),
      cell: (info) => (
        <i className={`fas ${info.getValue() ? 'fa-check text-success' : 'fa-times text-danger'}`} />
      ),
    }),
    columnHelper.accessor('scheduling.enabled', {
      header: translate('remote-catalog.label.scheduling'),
      cell: (info) => {
        const sched = info.row.original.scheduling;
        if (!sched?.enabled) return <span className="text-muted">—</span>;
        return <span className="badge bg-info">{sched.mode}</span>;
      },
    }),
    columnHelper.display({
      header: translate('remote-catalog.label.actions'),
      meta: { style: { textAlign: 'center', width: '120px' } },
      enableColumnFilter: false,
      enableSorting: false,
      cell: (info) => {
        const catalog = info.row.original;
        return (
          <div className="dropdown">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary dropdown-toggle"
              data-bs-toggle="dropdown"
              aria-expanded="false"
            >
              {translate('remote-catalog.label.actions')}
            </button>
            <div className="dropdown-menu" style={{ zIndex: 1 }}>
              <span className="dropdown-item cursor-pointer"
                onClick={() => run(translate('remote-catalog.action.deploy'), () => Services.deployRemoteCatalog(props.tenant._id, catalog.id))}>
                <i className="fas fa-rocket me-2" />{translate('remote-catalog.action.deploy')}
              </span>
              <span className="dropdown-item cursor-pointer"
                onClick={() => run(translate('remote-catalog.action.test'), () => Services.testRemoteCatalog(props.tenant._id, catalog.id))}>
                <i className="fas fa-vial me-2" />{translate('remote-catalog.action.test')}
              </span>
              <span className="dropdown-item cursor-pointer"
                onClick={() => run(translate('remote-catalog.action.undeploy'), () => Services.undeployRemoteCatalog(props.tenant._id, catalog.id))}>
                <i className="fas fa-eraser me-2" />{translate('remote-catalog.action.undeploy')}
              </span>
              <span className="dropdown-item cursor-pointer" onClick={() => showHistory(catalog)}>
                <i className="fas fa-history me-2" />{translate('remote-catalog.action.history')}
              </span>
              <div className="dropdown-divider" />
              <span className="dropdown-item cursor-pointer" onClick={() => editCatalog(catalog)}>
                <i className="fas fa-edit me-2" />{translate('remote-catalog.action.edit')}
              </span>
              <span className="dropdown-item cursor-pointer text-danger" onClick={() => deleteCatalog(catalog)}>
                <i className="fas fa-trash me-2" />{translate('remote-catalog.action.delete')}
              </span>
            </div>
          </div>
        );
      },
    }),
  ];

  return (
    <Can I={manage} a={TENANT} dispatchError>
      <div>
        <button
          type="button"
          className="btn btn-sm btn-outline-success my-1"
          onClick={() => editCatalog()}
        >
          <i className="fas fa-plus me-1" />
          {translate('remote-catalog.action.create')}
        </button>
        <div className="section p-2" />
        <Table
          defaultSort="name"
          columns={columns}
          fetchItems={() => props.tenant.remoteCatalogs ?? []}
          ref={table}
        />
      </div>
    </Can>
  );
};
