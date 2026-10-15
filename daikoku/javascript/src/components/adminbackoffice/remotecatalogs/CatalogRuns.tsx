import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { Fragment, ReactNode, useContext, useState } from 'react';
import { stringify } from 'yaml';

import { I18nContext } from '../../../contexts';
import { isError, ResponseError } from '../../../types';
import { formatDate } from '../../utils/formatters';

export type CatalogRunChange = {
  op: 'add' | 'remove' | 'replace';
  path: string;
  value?: unknown;
  old?: unknown;
};

export type CatalogRunEntity = {
  kind: string;
  id: string;
  name: string | null;
  changes?: Array<CatalogRunChange>;
};

export type CatalogRunError = {
  source: string;
  message: string;
  entity: CatalogRunEntity | null;
};

export type CatalogRun = {
  _id: string;
  at: number;
  status: 'completed' | 'partial' | 'failed';
  created: Array<CatalogRunEntity>;
  updated: Array<CatalogRunEntity>;
  deleted: Array<CatalogRunEntity>;
  detached: Array<CatalogRunEntity>;
  errors: Array<CatalogRunError>;
};

const STATUS_BADGE: Record<CatalogRun['status'], string> = {
  completed: '--success',
  partial: '--warning',
  failed: '--danger',
};

export const useRunDate = () => {
  const { translate } = useContext(I18nContext);

  return (at: number): string => {
    try {
      return formatDate(at, translate('date.locale'), translate('date.format'));
    } catch {
      return '';
    }
  };
};

const EntityLabel = (props: { entity: CatalogRunEntity }) => (
  <span className="d-inline-flex align-items-center gap-2">
    <span className="badge bg-secondary">{props.entity.kind}</span>
    {props.entity.name && <span>{props.entity.name}</span>}
    <span className="text-muted font-monospace small">{props.entity.id}</span>
  </span>
);

const ErrorLine = (props: { error: CatalogRunError }) => (
  <div className="d-flex flex-wrap align-items-center gap-2">
    {props.error.entity && <EntityLabel entity={props.error.entity} />}
    <span>{props.error.message}</span>
  </div>
);

const EntityCells = (props: {
  entity: CatalogRunEntity | null;
  toggle?: ReactNode;
}) => (
  <>
    <td>{props.toggle}</td>
    <td>{props.entity && <span className="badge bg-secondary">{props.entity.kind}</span>}</td>
    <td>{props.entity?.name}</td>
    <td className="text-muted font-monospace small">{props.entity?.id}</td>
  </>
);

type DiffLine = {
  kind: 'added' | 'removed';
  text: string;
};

const DIFF_SIGNS: Record<DiffLine['kind'], string> = {
  added: '+',
  removed: '-',
};

const fieldOf = (path: string) => {
  const segments = path
    .split('/')
    .slice(1)
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'));

  return segments.reduce((field, segment) => {
    if (/^\d+$/.test(segment)) {
      return `${field}[${segment}]`;
    } else if (field) {
      return `${field}.${segment}`;
    } else {
      return segment;
    }
  }, '');
};

const linesOf = (value: unknown): Array<string> => {
  if (typeof value === 'string') {
    return value.split('\n');
  } else if (typeof value === 'object' && value !== null) {
    return stringify(value).trimEnd().split('\n');
  } else {
    return [JSON.stringify(value)];
  }
};

const diffLinesOf = (change: CatalogRunChange): Array<DiffLine> => {
  const removed = change.op === 'add' ? [] : linesOf(change.old);
  const added = change.op === 'remove' ? [] : linesOf(change.value);

  return [
    ...removed.map((text): DiffLine => ({ kind: 'removed', text })),
    ...added.map((text): DiffLine => ({ kind: 'added', text })),
  ];
};

const EntityDiff = (props: { changes: Array<CatalogRunChange> }) => {
  const lines = props.changes.flatMap(diffLinesOf);
  const added = lines.filter((line) => line.kind === 'added').length;
  const removed = lines.filter((line) => line.kind === 'removed').length;

  return (
    <div className="catalog-diff">
      <div className="catalog-diff__header">
        <span className="catalog-diff__count--added">+{added}</span>
        <span className="catalog-diff__count--removed">-{removed}</span>
      </div>
      {props.changes.map((change, i) => (
        <div key={i} className="catalog-diff__change">
          <div className="catalog-diff__field">{fieldOf(change.path)}</div>
          {diffLinesOf(change).map((line, j) => (
            <div key={j} className={`catalog-diff__line catalog-diff__line--${line.kind}`}>
              <span className="catalog-diff__sign">{DIFF_SIGNS[line.kind]}</span>
              {line.text}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

const REPORT_ACTIONS = ['created', 'updated', 'deleted', 'detached'] as const;

const includesSearch = (search: string, values: Array<string | null>) =>
  values.some((value) => value?.toLowerCase().includes(search));

const ReportEntityRow = (props: {
  entity: CatalogRunEntity;
  withMessage: boolean;
}) => {
  const { translate } = useContext(I18nContext);
  const [open, setOpen] = useState(true);

  const changes = props.entity.changes ?? [];
  const showDiff = open && changes.length > 0;
  const toggleLabel = translate({
    key: 'remote-catalog.report.changeCount',
    plural: changes.length > 1,
    replacements: [String(changes.length)],
  });

  const toggle =
    changes.length > 0 ? (
      <button
        type="button"
        className="btn btn-sm btn-outline-secondary catalog-report__toggle"
        title={toggleLabel}
        aria-label={toggleLabel}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
    ) : null;

  return (
    <>
      <tr>
        <EntityCells entity={props.entity} toggle={toggle} />
        {props.withMessage && <td />}
      </tr>
      {showDiff && (
        <tr>
          <td />
          <td colSpan={props.withMessage ? 4 : 3}>
            <EntityDiff changes={changes} />
          </td>
        </tr>
      )}
    </>
  );
};

const ReportSectionRows = (props: {
  title: string;
  entities: Array<CatalogRunEntity>;
  withMessage: boolean;
}) => {
  if (props.entities.length === 0) {
    return null;
  }

  return (
    <>
      <tr>
        <th colSpan={props.withMessage ? 5 : 4}>
          {props.title} ({props.entities.length})
        </th>
      </tr>
      {props.entities.map((entity) => (
        <ReportEntityRow
          key={`${entity.kind}/${entity.id}`}
          entity={entity}
          withMessage={props.withMessage}
        />
      ))}
    </>
  );
};

const ReportErrorRows = (props: { errors: Array<CatalogRunError> }) => {
  const { translate } = useContext(I18nContext);

  if (props.errors.length === 0) {
    return null;
  }

  const sources = [...new Set(props.errors.map((error) => error.source))];

  return (
    <>
      <tr>
        <th colSpan={5} className="text-danger">
          {translate('remote-catalog.report.errors')} ({props.errors.length})
        </th>
      </tr>
      {sources.map((source) => (
        <Fragment key={source}>
          <tr>
            <td colSpan={5} className="font-monospace small">
              {source}
            </td>
          </tr>
          {props.errors
            .filter((error) => error.source === source)
            .map((error, i) => (
              <tr key={i}>
                <EntityCells entity={error.entity} />
                <td className="text-danger">{error.message}</td>
              </tr>
            ))}
        </Fragment>
      ))}
    </>
  );
};

export const RunReport = (props: { run: CatalogRun }) => {
  const { translate } = useContext(I18nContext);
  const [filter, setFilter] = useState('');

  const search = filter.trim().toLowerCase();

  const entityMatches = (entity: CatalogRunEntity) =>
    includesSearch(search, [entity.kind, entity.id, entity.name]);

  const errorMatches = (error: CatalogRunError) =>
    includesSearch(search, [error.source, error.message]) ||
    (error.entity !== null && entityMatches(error.entity));

  const sections = REPORT_ACTIONS.map((action) => ({
    action,
    entities: props.run[action].filter(entityMatches),
  }));
  const errors = props.run.errors.filter(errorMatches);
  const hasErrors = errors.length > 0;
  const nothingToShow =
    !hasErrors && sections.every((section) => section.entities.length === 0);

  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-3">
        <span className={`badge ${STATUS_BADGE[props.run.status]}`}>
          {translate(`remote-catalog.run.status.${props.run.status}`)}
        </span>
        <input
          type="search"
          className="form-control form-control-sm"
          placeholder={translate('remote-catalog.report.filter')}
          aria-label={translate('remote-catalog.report.filter')}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      {nothingToShow ? (
        <div className="text-muted">{translate('remote-catalog.report.empty')}</div>
      ) : (
        <table className="table table-sm align-middle mb-0 catalog-report">
          <colgroup>
            <col className="catalog-report__toggle-column" />
            <col className="catalog-report__kind-column" />
            <col />
            <col />
            {hasErrors && <col />}
          </colgroup>
          <thead>
            <tr>
              <th />
              <th>{translate('Type')}</th>
              <th>{translate('Name')}</th>
              <th>{translate('remote-catalog.report.col.id')}</th>
              {hasErrors && <th>{translate('Message')}</th>}
            </tr>
          </thead>
          <tbody>
            <ReportErrorRows errors={errors} />
            {sections.map((section) => (
              <ReportSectionRows
                key={section.action}
                title={translate(`remote-catalog.col.${section.action}`)}
                entities={section.entities}
                withMessage={hasErrors}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

const RunRow = (props: {
  run: CatalogRun;
  showErrors: boolean;
  onShowReport: (run: CatalogRun) => void;
}) => {
  const { translate } = useContext(I18nContext);
  const runDate = useRunDate();

  const badgeClass = `badge ${STATUS_BADGE[props.run.status]}`;
  const hasErrors = props.showErrors && props.run.errors?.length > 0;

  return (
    <>
      <tr>
        <td>{runDate(props.run.at)}</td>
        <td>
          <span className={badgeClass}>
            {translate(`remote-catalog.run.status.${props.run.status}`)}
          </span>
        </td>
        <td className="text-center">{props.run.created.length}</td>
        <td className="text-center">{props.run.updated.length}</td>
        <td className="text-center">{props.run.deleted.length}</td>
        <td className="text-center">{props.run.detached.length}</td>
        <td className="text-end">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            title={translate('remote-catalog.report.open')}
            aria-label={translate('remote-catalog.report.open')}
            onClick={() => props.onShowReport(props.run)}
          >
            <FileText size={14} />
          </button>
        </td>
      </tr>
      {hasErrors && (
        <tr>
          <td colSpan={7} className="text-danger small">
            {props.run.errors.map((error, i) => (
              <div key={i}>
                <div className="font-monospace">{error.source}</div>
                <ErrorLine error={error} />
              </div>
            ))}
          </td>
        </tr>
      )}
    </>
  );
};

export const HistoryRuns = (props: {
  isLoading: boolean;
  data?: ResponseError | Array<CatalogRun>;
  onShowReport: (run: CatalogRun) => void;
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
    <table className="table table-sm align-middle mb-0 catalog-runs">
      <colgroup>
        <col className="catalog-runs__date-column" />
        <col className="catalog-runs__status-column" />
        <col className="catalog-runs__count-column" />
        <col className="catalog-runs__count-column" />
        <col className="catalog-runs__count-column" />
        <col className="catalog-runs__count-column" />
        <col className="catalog-runs__action-column" />
      </colgroup>
      <thead>
        <tr>
          <th>{translate('remote-catalog.col.date')}</th>
          <th>{translate('remote-catalog.col.status')}</th>
          <th className="text-center">{translate('remote-catalog.col.created')}</th>
          <th className="text-center">{translate('remote-catalog.col.updated')}</th>
          <th className="text-center">{translate('remote-catalog.col.deleted')}</th>
          <th className="text-center">{translate('remote-catalog.col.detached')}</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {runs.map((run, index) => (
          <RunRow
            key={run._id}
            run={run}
            showErrors={index === 0}
            onShowReport={props.onShowReport}
          />
        ))}
      </tbody>
    </table>
  );
};
