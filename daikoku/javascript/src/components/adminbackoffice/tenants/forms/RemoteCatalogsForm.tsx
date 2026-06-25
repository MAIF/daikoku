import { constraints, Form, format, type } from '@maif/react-forms';
import { UseMutationResult, useQuery, useQueryClient } from '@tanstack/react-query';
import { useContext, useState } from 'react';
import { toast } from 'sonner';

import { I18nContext } from '../../../../contexts';
import * as Services from '../../../../services';
import { IRemoteCatalog, ITenantFull } from '../../../../types';

const CatalogActions = ({ tenantId, catalog }: { tenantId: string; catalog: IRemoteCatalog }) => {
  const { translate } = useContext(I18nContext);
  const queryClient = useQueryClient();
  const [report, setReport] = useState<any>(null);

  const history = useQuery({
    queryKey: ['remote-catalog-history', tenantId, catalog.id],
    queryFn: () => Services.getRemoteCatalogHistory(tenantId, catalog.id),
  });

  const run = (fn: () => Promise<any>) =>
    fn().then((r) => {
      setReport(r);
      if (r?.error) {
        toast.error(r.error);
      } else {
        toast.success(translate('Done'));
        queryClient.invalidateQueries({
          queryKey: ['remote-catalog-history', tenantId, catalog.id],
        });
      }
    });

  return (
    <div className="border rounded p-2 mb-2">
      <div className="d-flex align-items-center justify-content-between">
        <strong>
          {catalog.name} <span className="text-muted">({catalog.id})</span>
        </strong>
        <div className="btn-group">
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            onClick={() => run(() => Services.deployRemoteCatalog(tenantId, catalog.id))}
          >
            {translate('Deploy')}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={() => run(() => Services.testRemoteCatalog(tenantId, catalog.id))}
          >
            {translate('Test')}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-danger"
            onClick={() => run(() => Services.undeployRemoteCatalog(tenantId, catalog.id))}
          >
            {translate('Undeploy')}
          </button>
        </div>
      </div>
      {report && <pre className="mt-2 mb-0">{JSON.stringify(report, null, 2)}</pre>}
      <div className="mt-2">
        <div className="text-muted">{translate('Last runs')}</div>
        {(history.data ?? []).map((r: any, i: number) => (
          <div key={i} className="small">
            {r.at} — created: {(r.created ?? []).length}, updated: {(r.updated ?? []).length}, deleted:{' '}
            {(r.deleted ?? []).length}
          </div>
        ))}
      </div>
    </div>
  );
};

export const RemoteCatalogsForm = (props: {
  tenant: ITenantFull;
  updateTenant: UseMutationResult<any, unknown, ITenantFull, unknown>;
}) => {
  const { translate } = useContext(I18nContext);

  const schema = {
    remoteCatalogs: {
      type: type.object,
      format: format.form,
      array: true,
      label: translate('Remote catalogs'),
      schema: {
        id: {
          type: type.string,
          label: translate('Id'),
          constraints: [constraints.required(translate('constraints.required.id'))],
        },
        name: { type: type.string, label: translate('Name') },
        enabled: { type: type.bool, label: translate('Enabled'), defaultValue: true },
        source: {
          type: type.object,
          format: format.form,
          label: translate('Source'),
          schema: {
            kind: {
              type: type.string,
              format: format.select,
              label: translate('Kind'),
              defaultValue: 'http',
              options: ['file', 'http', 'github', 'gitlab'],
            },
            config: { type: type.object, label: translate('Config') },
          },
        },
        scheduling: {
          type: type.object,
          format: format.form,
          label: translate('Scheduling'),
          schema: {
            enabled: { type: type.bool, label: translate('Enabled') },
            mode: {
              type: type.string,
              format: format.select,
              label: translate('Mode'),
              defaultValue: 'interval',
              options: ['interval', 'cron'],
            },
            interval: { type: type.number, label: translate('Interval (ms)') },
            cronExpression: { type: type.string, label: translate('Cron expression') },
          },
        },
        allowedKinds: { type: type.string, array: true, label: translate('Allowed kinds') },
      },
    },
  };

  return (
    <div>
      <Form
        schema={schema}
        value={props.tenant}
        onSubmit={(d) => props.updateTenant.mutateAsync(d)}
        options={{ actions: { submit: { label: translate('Save') } } }}
      />
      <div className="mt-3">
        {(props.tenant.remoteCatalogs ?? []).map((c) => (
          <CatalogActions key={c.id} tenantId={props.tenant._id} catalog={c} />
        ))}
      </div>
    </div>
  );
};
