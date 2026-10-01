import { constraints, Form, format, Schema, type } from '@maif/react-forms';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { useContext, useState } from 'react';

import { QUERY_KEYS } from '../../../../constants/queryKeys';
import { I18nContext, ModalContext } from '../../../../contexts';
import * as Services from '../../../../services';
import {
  IRemoteCatalog,
  isError,
  ITenantFull,
  RemoteCatalogSourceKind,
  ResponseError,
} from '../../../../types';
import { clientFetchData, DynamicTable, DynamicTableFeatures, FilterDef } from '../../../inputs';
import { Can, manage, tenant as TENANT } from '../../../utils';
import { copyToClipboard } from '../../../utils/clipboard';
import { DismissibleError } from '../../../utils/DismissibleError';
import { formatDate } from '../../../utils/formatters';

const SOURCE_KINDS: Array<RemoteCatalogSourceKind> = ['file', 'http', 'github', 'gitlab'];
const ENTITY_KINDS = ['team', 'usage-plan', 'api', 'keyring', 'api-subscription', 'cms-page'];

const emptyCatalog = (): Partial<IRemoteCatalog> => ({
  name: '',
  enabled: true,
  source: { kind: 'http', config: {} as any },
  scheduling: { enabled: false },
  allowedKinds: [],
  maxDeletionPercent: 30,
  adoptExisting: false,
  folderPerTeam: false,
  allowDeletions: true,
});

type CatalogRun = {
  _id: string;
  at: number;
  status: 'completed' | 'partial' | 'failed';
  created: Array<string>;
  updated: Array<string>;
  deleted: Array<string>;
  detached: Array<string>;
  errors: Array<string>;
};

const STATUS_BADGE: Record<CatalogRun['status'], string> = {
  completed: 'bg-success',
  partial: 'bg-warning',
  failed: 'bg-danger',
};

const RunRow = (props: { run: CatalogRun; formatAt: (at: any) => string }) => {
  const { translate } = useContext(I18nContext);

  const badgeClass = `badge ${STATUS_BADGE[props.run.status]}`;
  const hasErrors = props.run.errors.length > 0;

  return (
    <>
      <tr>
        <td>{props.formatAt(props.run.at)}</td>
        <td>
          <span className={badgeClass}>
            {translate(`remote-catalog.run.status.${props.run.status}`)}
          </span>
        </td>
        <td className="text-center text-success">{props.run.created.length}</td>
        <td className="text-center text-info">{props.run.updated.length}</td>
        <td className="text-center text-warning">{props.run.deleted.length}</td>
        <td className="text-center text-muted">{props.run.detached.length}</td>
      </tr>
      {hasErrors && (
        <tr>
          <td colSpan={6} className="text-danger small">
            {props.run.errors.map((error, i) => (
              <div key={i}>{error}</div>
            ))}
          </td>
        </tr>
      )}
    </>
  );
};

const useRemoteCatalogHistory = (tenantId: string, catalogId: string) =>
  useQuery({
    queryKey: QUERY_KEYS.remoteCatalogHistory(tenantId, catalogId),
    queryFn: (): Promise<ResponseError | Array<CatalogRun>> =>
      Services.getRemoteCatalogHistory(tenantId, catalogId),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: 'always',
    refetchInterval: 10_000,
  });

const HistoryRuns = (props: {
  isLoading: boolean;
  data?: ResponseError | Array<CatalogRun>;
  formatAt: (at: any) => string;
}) => {
  const { translate } = useContext(I18nContext);

  if (props.isLoading) {
    return <div className="text-muted">{translate('loading')}</div>;
  }

  if (isError(props.data)) {
    return (
      <div className="alert alert-danger" role="alert">
        {props.data.error}
      </div>
    );
  }

  const runs = props.data ?? [];

  if (runs.length === 0) {
    return <div>{translate('remote-catalog.noRun')}</div>;
  }

  return (
    <table className="table table-sm align-middle mb-0">
      <thead>
        <tr>
          <th>{translate('remote-catalog.col.date')}</th>
          <th>{translate('remote-catalog.col.status')}</th>
          <th className="text-center">{translate('remote-catalog.col.created')}</th>
          <th className="text-center">{translate('remote-catalog.col.updated')}</th>
          <th className="text-center">{translate('remote-catalog.col.deleted')}</th>
          <th className="text-center">{translate('remote-catalog.col.detached')}</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((run) => (
          <RunRow key={run._id} run={run} formatAt={props.formatAt} />
        ))}
      </tbody>
    </table>
  );
};

const CatalogHistory = (props: {
  tenantId: string;
  catalog: IRemoteCatalog;
  formatAt: (at: any) => string;
}) => {
  const { translate } = useContext(I18nContext);

  const history = useRemoteCatalogHistory(props.tenantId, props.catalog._id);

  const refreshIcon = history.isFetching ? 'fas fa-sync-alt fa-spin' : 'fas fa-sync-alt';

  return (
    <div>
      <div className="d-flex justify-content-end mb-2">
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          title={translate('remote-catalog.action.refresh')}
          aria-label={translate('remote-catalog.action.refresh')}
          onClick={() => history.refetch()}
        >
          <i className={refreshIcon} />
        </button>
      </div>
      <HistoryRuns isLoading={history.isLoading} data={history.data} formatAt={props.formatAt} />
    </div>
  );
};

const CatalogToken = (props: {
  tenantId: string;
  catalog: IRemoteCatalog;
  onRegenerated: () => void;
}) => {
  const { translate } = useContext(I18nContext);
  const { confirm } = useContext(ModalContext);
  const [token, setToken] = useState(props.catalog.token);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string>();

  const catalogUrl = `${window.location.origin}/api/remote-catalogs/${props.catalog._id}`;
  const webhookUrl = `${catalogUrl}/_webhook`;
  const supportsWebhook = ['github', 'gitlab'].includes(props.catalog.source.kind);
  const curlFor = (action: string, withFiles: boolean) =>
    [
      `curl -X POST ${catalogUrl}/${action} \\`,
      `  -H "Authorization: Bearer $DAIKOKU_CATALOG_TOKEN"${withFiles ? ' \\' : ''}`,
      ...(withFiles
        ? ['  -H "Content-Type: application/json" \\', '  -d @catalog-files.json']
        : []),
    ].join('\n');
  const copyIcon = copied ? 'fas fa-check' : 'fas fa-copy';

  const copy = () =>
    copyToClipboard(token).then(() => {
      setCopied(true);
    });

  const regenerate = () =>
    confirm({
      message: translate('remote-catalog.token.regenerateConfirm'),
      okLabel: translate('remote-catalog.token.regenerate'),
    }).then((ok) => {
      if (!ok) {
        return;
      }

      Services.regenerateRemoteCatalogToken(props.tenantId, props.catalog._id).then((response) => {
        if (isError(response)) {
          setError(response.error);
          return;
        }

        setToken(response.token);
        setCopied(false);
        props.onRegenerated();
      });
    });

  return (
    <div>
      <label className="form-label">{translate('remote-catalog.token.label')}</label>
      <div className="input-group mb-2">
        <input className="form-control" readOnly value={token} />
        <button
          type="button"
          className="btn btn-outline-secondary"
          aria-label={translate('remote-catalog.token.copy')}
          onClick={copy}
        >
          <i className={copyIcon} />
        </button>
      </div>
      <button type="button" className="btn btn-sm btn-outline-danger mb-3" onClick={regenerate}>
        {translate('remote-catalog.token.regenerate')}
      </button>
      {!!error && <DismissibleError message={error} onClose={() => setError(undefined)} />}
      <p className="small text-muted">{translate('remote-catalog.token.help')}</p>
      <pre className="small">
        <code>{curlFor('_validate', true)}</code>
      </pre>
      <p className="small text-muted">{translate('remote-catalog.token.deployHelp')}</p>
      <pre className="small">
        <code>{curlFor('_deploy', false)}</code>
      </pre>
      {supportsWebhook && (
        <>
          <h6 className="mt-4">{translate('remote-catalog.webhook.title')}</h6>
          <label className="form-label">{translate('remote-catalog.webhook.url')}</label>
          <div className="input-group mb-2">
            <input className="form-control" readOnly value={webhookUrl} />
            <button
              type="button"
              className="btn btn-outline-secondary"
              aria-label={translate('remote-catalog.token.copy')}
              onClick={() => copyToClipboard(webhookUrl)}
            >
              <i className="fas fa-copy" />
            </button>
          </div>
          <p className="small">
            {translate(`remote-catalog.webhook.${props.catalog.source.kind}`)}
          </p>
          <p className="small text-warning">{translate('remote-catalog.webhook.warning')}</p>
        </>
      )}
    </div>
  );
};

const CatalogEditor = (props: {
  tenantId: string;
  catalog?: IRemoteCatalog;
  schema: Schema;
  onSaved: () => void;
}) => {
  const { translate } = useContext(I18nContext);
  const [error, setError] = useState<string>();

  const save = (data: IRemoteCatalog) => {
    const request = props.catalog
      ? Services.updateRemoteCatalog(props.tenantId, { ...data, _id: props.catalog._id })
      : Services.createRemoteCatalog(props.tenantId, data);

    return request.then((response) => {
      if (isError(response)) {
        setError(response.error);
        return;
      }

      props.onSaved();
    });
  };

  return (
    <>
      {!!error && <DismissibleError message={error} onClose={() => setError(undefined)} />}
      <Form<IRemoteCatalog>
        schema={props.schema}
        value={props.catalog ?? (emptyCatalog() as IRemoteCatalog)}
        onSubmit={save}
        options={{
          actions: {
            submit: {
              label: props.catalog
                ? translate('remote-catalog.modal.updateBtn')
                : translate('remote-catalog.modal.createBtn'),
            },
          },
        }}
      />
    </>
  );
};

export const RemoteCatalogsForm = (props: { tenant: ITenantFull }) => {
  const { translate } = useContext(I18nContext);
  const { openFormModal, confirm, alert, openRightPanel, closeRightPanel } =
    useContext(ModalContext);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string>();

  const queryKey = QUERY_KEYS.remoteCatalogs(props.tenant._id);

  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const catalogsQuery = useQuery({
    queryKey,
    queryFn: () => Services.getRemoteCatalogs(props.tenant._id),
  });
  const isEmpty = Array.isArray(catalogsQuery.data) && catalogsQuery.data.length === 0;

  const showHistory = (catalog: IRemoteCatalog) =>
    openRightPanel({
      title: `${catalog.name} — ${translate('remote-catalog.action.history')}`,
      content: <CatalogHistory tenantId={props.tenant._id} catalog={catalog} formatAt={formatAt} />,
    });

  const showToken = (catalog: IRemoteCatalog) =>
    openRightPanel({
      title: `${catalog.name} — ${translate('remote-catalog.action.token')}`,
      content: (
        <CatalogToken tenantId={props.tenant._id} catalog={catalog} onRegenerated={refresh} />
      ),
    });

  const formatAt = (at: any): string => {
    const ts = typeof at === 'object' && at !== null ? at.$long : at;
    if (!ts) return '';
    return formatDate(ts, translate('date.locale'), translate('date.format'));
  };

  const deploy = (catalog: IRemoteCatalog) =>
    Services.deployRemoteCatalog(props.tenant._id, catalog._id).then(() => showHistory(catalog));

  const dryRun = (catalog: IRemoteCatalog) =>
    Services.testRemoteCatalog(props.tenant._id, catalog._id).then((run) =>
      alert({
        title: `${catalog.name} — ${translate('remote-catalog.action.test')}`,
        message: <HistoryRuns isLoading={false} data={[run]} formatAt={formatAt} />,
      })
    );

  const undeploy = (catalog: IRemoteCatalog) =>
    confirm({
      message: translate({ key: 'remote-catalog.undeployConfirm', replacements: [catalog.name] }),
      okLabel: translate('remote-catalog.action.undeploy'),
    }).then((ok) => {
      if (!ok) {
        return;
      }

      Services.undeployRemoteCatalog(props.tenant._id, catalog._id).then(() =>
        showHistory(catalog)
      );
    });

  const catalogSchema = (): Schema => ({
    name: {
      type: type.string,
      label: translate('remote-catalog.label.name'),
      constraints: [constraints.required(translate('remote-catalog.constraint.name'))],
    },
    enabled: {
      type: type.bool,
      label: translate('remote-catalog.label.enabled'),
      defaultValue: true,
    },
    source: {
      type: type.object,
      format: format.form,
      label: translate('remote-catalog.label.source'),
      schema: {
        kind: {
          type: type.string,
          format: format.select,
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
                constraints.when('source.kind', (k) => k === 'file', [
                  constraints.required(translate('remote-catalog.constraint.path')),
                ]),
              ],
            },
            recursive: {
              type: type.bool,
              label: translate('remote-catalog.label.recursive'),
              help: translate('remote-catalog.help.recursive'),
              defaultValue: false,
              visible: ({ rawValues }) => rawValues.source.kind !== 'http',
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
                constraints.when('source.kind', (k) => k === 'http', [
                  constraints.required(translate('remote-catalog.constraint.url')),
                ]),
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
                constraints.when('source.kind', (k) => k === 'github' || k === 'gitlab', [
                  constraints.required(translate('remote-catalog.constraint.repo')),
                ]),
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
          help: translate('remote-catalog.help.enableScheduling'),
          defaultValue: false,
        },
      },
    },
    allowedKinds: {
      type: type.string,
      format: format.select,
      isMulti: true,
      label: translate('remote-catalog.label.allowedKinds'),
      help: translate('remote-catalog.help.allowedKinds'),
      options: ENTITY_KINDS,
    },
    maxDeletionPercent: {
      type: type.number,
      label: translate('remote-catalog.label.maxDeletionPercent'),
      help: translate('remote-catalog.help.maxDeletionPercent'),
      defaultValue: 30,
    },
    allowDeletions: {
      type: type.bool,
      label: translate('remote-catalog.label.allowDeletions'),
      help: translate('remote-catalog.help.allowDeletions'),
      defaultValue: true,
    },
    adoptExisting: {
      type: type.bool,
      label: translate('remote-catalog.label.adoptExisting'),
      help: translate('remote-catalog.help.adoptExisting'),
      defaultValue: false,
    },
    folderPerTeam: {
      type: type.bool,
      label: translate('remote-catalog.label.folderPerTeam'),
      help: translate('remote-catalog.help.folderPerTeam'),
      defaultValue: false,
      visible: ({ rawValues }) =>
        rawValues.source?.kind === 'github' || rawValues.source?.kind === 'gitlab',
    },
  });

  const editCatalog = (catalog?: IRemoteCatalog) =>
    openRightPanel({
      title: catalog
        ? translate('remote-catalog.modal.edit')
        : translate('remote-catalog.modal.create'),
      content: (
        <CatalogEditor
          tenantId={props.tenant._id}
          catalog={catalog}
          schema={catalogSchema()}
          onSaved={() => {
            closeRightPanel();
            refresh();
          }}
        />
      ),
    });

  const fetchData = clientFetchData<IRemoteCatalog>(
    () => Services.getRemoteCatalogs(props.tenant._id),
    {
      searchable: (c) => [c.name, c.source?.kind],
      sortValues: {
        source: (c) => c.source?.kind,
        scheduling: (c) => !!c.scheduling?.enabled,
      },
    }
  );

  const filters: FilterDef[] = [{ id: 'search', type: 'text', placeholder: translate('Search') }];

  const deleteCatalog = (catalog: IRemoteCatalog) =>
    confirm({
      message: translate({ key: 'remote-catalog.deleteConfirm', replacements: [catalog.name] }),
      okLabel: translate('remote-catalog.action.delete'),
    }).then((ok) => {
      if (!ok) {
        return;
      }

      Services.deleteRemoteCatalog(props.tenant._id, catalog._id).then((response) => {
        if (isError(response)) {
          setError(response.error);
          return;
        }

        setError(undefined);
        refresh();
      });
    });

  // a plain navigation lets the browser stream the zip to disk
  const exportTenant = () =>
    openFormModal<{ all: boolean }>({
      title: translate('remote-catalog.modal.export'),
      schema: {
        all: {
          type: type.bool,
          label: translate('remote-catalog.label.exportAll'),
          help: translate('remote-catalog.help.exportAll'),
          defaultValue: false,
        },
      },
      value: { all: false },
      onSubmit: ({ all }) => {
        window.location.assign(
          `/api/tenants/${props.tenant._id}/remote-catalogs/_export?all=${all}`
        );
      },
      actionLabel: translate('remote-catalog.modal.exportBtn'),
    });

  const columnHelper = createColumnHelper<DynamicTableFeatures, IRemoteCatalog>();
  const columns = [
    columnHelper.accessor('name', {
      id: 'name',
      meta: { title: translate('remote-catalog.label.name'), size: 25 },
    }),
    columnHelper.accessor('source.kind', {
      id: 'source',
      meta: { title: translate('remote-catalog.label.source'), size: 15 },
      cell: (info) => <span className="badge bg-secondary">{info.getValue()}</span>,
    }),
    columnHelper.accessor('enabled', {
      id: 'enabled',
      meta: { title: translate('remote-catalog.label.enabled'), size: 10 },
      cell: (info) => (
        <i
          className={`fas ${info.getValue() ? 'fa-check text-success' : 'fa-times text-danger'}`}
        />
      ),
    }),
    columnHelper.accessor('scheduling.enabled', {
      id: 'scheduling',
      meta: { title: translate('remote-catalog.label.scheduling'), size: 10 },
      cell: (info) => {
        const sched = info.row.original.scheduling;
        if (!sched?.enabled) return <span className="text-muted">—</span>;
        return <i className="fas fa-check text-success" />;
      },
    }),
    columnHelper.display({
      id: 'actions',
      meta: {
        title: translate('remote-catalog.label.actions'),
        size: 12,
        className: 'action-cell',
      },
      cell: (info) => {
        const catalog = info.row.original;
        return (
          <div className="dropdown">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary dropdown-toggle"
              data-bs-toggle="dropdown"
              data-bs-popper-config='{"strategy":"fixed"}'
              aria-expanded="false"
            >
              {translate('remote-catalog.label.actions')}
            </button>
            <div className="dropdown-menu">
              <span className="dropdown-item cursor-pointer" onClick={() => deploy(catalog)}>
                <i className="fas fa-rocket me-2" />
                {translate('remote-catalog.action.deploy')}
              </span>
              <span className="dropdown-item cursor-pointer" onClick={() => dryRun(catalog)}>
                <i className="fas fa-vial me-2" />
                {translate('remote-catalog.action.test')}
              </span>
              <span className="dropdown-item cursor-pointer" onClick={() => undeploy(catalog)}>
                <i className="fas fa-eraser me-2" />
                {translate('remote-catalog.action.undeploy')}
              </span>
              <span className="dropdown-item cursor-pointer" onClick={() => showHistory(catalog)}>
                <i className="fas fa-history me-2" />
                {translate('remote-catalog.action.history')}
              </span>
              <span className="dropdown-item cursor-pointer" onClick={() => showToken(catalog)}>
                <i className="fas fa-key me-2" />
                {translate('remote-catalog.action.token')}
              </span>
              <div className="dropdown-divider" />
              <span className="dropdown-item cursor-pointer" onClick={() => editCatalog(catalog)}>
                <i className="fas fa-edit me-2" />
                {translate('remote-catalog.action.edit')}
              </span>
              <span
                className="dropdown-item cursor-pointer text-danger"
                onClick={() => deleteCatalog(catalog)}
              >
                <i className="fas fa-trash me-2" />
                {translate('remote-catalog.action.delete')}
              </span>
            </div>
          </div>
        );
      },
    }),
  ];

  return (
    <Can I={manage} a={TENANT} dispatchError>
      <div className="m-3">
        {isEmpty ? (
          <div className="card my-4" style={{ maxWidth: '45rem' }}>
            <div className="card-body">
              <h4 className="card-title">{translate('remote-catalog.empty.title')}</h4>
              <p className="card-text text-muted">
                {translate('remote-catalog.empty.description')}
              </p>
              <button
                type="button"
                className="btn btn-outline-success"
                onClick={() => editCatalog()}
              >
                <i className="fas fa-plus me-1" />
                {translate('remote-catalog.empty.create')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-sm btn-outline-success my-2"
              onClick={() => editCatalog()}
            >
              <i className="fas fa-plus me-1" />
              {translate('remote-catalog.action.create')}
            </button>
            <div className="section p-2" />
            {!!error && <DismissibleError message={error} onClose={() => setError(undefined)} />}
            <DynamicTable<IRemoteCatalog>
              queryKey={queryKey}
              columns={columns}
              fetchData={fetchData}
              filters={filters}
              defaultSorting={[{ id: 'name', desc: false }]}
              getRowId={(row) => row._id}
              getRowAriaLabel={(row) => row.name}
            />
            <div className="card mt-4">
              <div className="card-body">
                <h6 className="card-title">{translate('remote-catalog.export.title')}</h6>
                <p className="card-text small text-muted">
                  {translate({
                    key: 'remote-catalog.export.description',
                    replacements: [props.tenant.name],
                  })}
                </p>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={exportTenant}
                >
                  <i className="fas fa-download me-1" />
                  {translate({
                    key: 'remote-catalog.export.button',
                    replacements: [props.tenant.name],
                  })}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Can>
  );
};
