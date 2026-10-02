import { useContext } from 'react';

import { I18nContext } from '../../../contexts';
import { isError, ResponseError } from '../../../types';
import { formatDate } from '../../utils/formatters';

export type CatalogRun = {
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

const RunRow = (props: { run: CatalogRun }) => {
  const { translate } = useContext(I18nContext);

  const badgeClass = `badge ${STATUS_BADGE[props.run.status]}`;
  const hasErrors = props.run.errors.length > 0;

  const formatAt = (at: any): string => {
    const ts = typeof at === 'object' && at !== null ? at.$long : at;

    if (!ts) {
      return '';
    }

    return formatDate(ts, translate('date.locale'), translate('date.format'));
  };

  return (
    <>
      <tr>
        <td>{formatAt(props.run.at)}</td>
        <td>
          <span className={badgeClass}>
            {translate(`remote-catalog.run.status.${props.run.status}`)}
          </span>
        </td>
        <td className="text-center">{props.run.created.length}</td>
        <td className="text-center">{props.run.updated.length}</td>
        <td className="text-center">{props.run.deleted.length}</td>
        <td className="text-center">{props.run.detached.length}</td>
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

export const HistoryRuns = (props: {
  isLoading: boolean;
  data?: ResponseError | Array<CatalogRun>;
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
          <RunRow key={run._id} run={run} />
        ))}
      </tbody>
    </table>
  );
};
