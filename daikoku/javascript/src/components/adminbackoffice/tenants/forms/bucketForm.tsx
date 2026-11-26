import { Form, Schema, type } from '@maif/react-forms';
import { useContext } from 'react';
import { useMutation, UseMutationResult } from '@tanstack/react-query';
import classNames from 'classnames';
import { Loader } from 'lucide-react';

import { I18nContext } from '../../../../contexts';
import { testBucketConfiguration } from '../../../../services';
import { BucketTestStepStatus, IBucketSettings, isError, ITenantFull } from '../../../../types';

const badgeByStatus: Record<BucketTestStepStatus, string> = {
  success: '--success',
  failed: '--danger',
  skipped: '--inactive',
};

const BucketTest = (props: { tenantId: string; settings: IBucketSettings }) => {
  const { translate } = useContext(I18nContext);

  const test = useMutation({
    mutationFn: () => testBucketConfiguration(props.tenantId, props.settings),
  });

  return (
    <div className="d-flex flex-column gap-2">
      <button
        type="button"
        className="btn --secondary align-self-start d-flex align-items-center gap-2"
        disabled={test.isPending}
        onClick={() => test.mutate()}
      >
        {test.isPending && <Loader className="--rotate" size={16} />}
        {translate('tenant.settings.bucket.test.button.label')}
      </button>

      {test.isError && (
        <div className="text-danger">{translate('tenant.settings.bucket.test.failed.label')}</div>
      )}

      {test.data && isError(test.data) && <div className="text-danger">{test.data.error}</div>}

      {test.data && !isError(test.data) && (
        <ul className="list-unstyled d-flex flex-column gap-1 mb-0">
          {test.data.steps.map((step) => (
            <li key={step.name}>
              <div className="d-flex align-items-center gap-2">
                <span className={classNames('badge', badgeByStatus[step.status])}>
                  {translate(`tenant.settings.bucket.test.status.${step.status}`)}
                </span>
                <span>{translate(`tenant.settings.bucket.test.step.${step.name}`)}</span>
              </div>
              {step.error && <div className="text-danger small">{step.error}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const BucketForm = (props: {
  tenant?: ITenantFull;
  updateTenant: UseMutationResult<any, unknown, ITenantFull, unknown>;
}) => {
  const { translate } = useContext(I18nContext);

  const schema: Schema = {
    bucket: {
      type: type.string,
      label: translate('Bucket name'),
      placeholder: 'daikoku-tenant-1',
      help: translate('The name of the S3 bucket'),
    },
    endpoint: {
      type: type.string,
      label: translate('Bucket url'),
      placeholder: 'https://<bucket-name>.example-s3.io',
      help: translate('The url of the bucket'),
    },
    region: {
      type: type.string,
      label: translate('S3 region'),
      placeholder: 'us-west-2',
      help: translate('The region of the bucket'),
    },
    access: {
      type: type.string,
      label: translate('Bucket access key'),
      help: translate('The access key to access bucket'),
    },
    secret: {
      type: type.string,
      label: translate('Bucket secret'),
      help: translate('The secret to access the bucket'),
    },
    chunkSize: {
      type: type.number,
      label: translate('Chunk size'),
      defaultValue: 1024 * 1024 * 8,
      help: translate('The size of each chunk sent'),
    },
    v4auth: {
      type: type.bool,
      label: translate('Use V4 auth.'),
      defaultValue: true,
    },
    testConnection: {
      type: type.string,
      label: null,
      render: ({ rawValues }) =>
        props.tenant ? <BucketTest tenantId={props.tenant._id} settings={rawValues} /> : <></>,
    },
  };

  return (
    <div
      className="m-2 me-auto"
      style={{
        minWidth: 560,
      }}
    >
      <Form<IBucketSettings>
        schema={schema}
        onSubmit={(r) =>
          props.updateTenant.mutateAsync({
            ...props.tenant,
            bucketSettings: r,
          } as ITenantFull)
        }
        value={props.tenant?.bucketSettings}
        options={{
          actions: {
            submit: { label: translate('Save') },
          },
        }}
      />
    </div>
  );
};
