import { Form, Schema, type } from '@maif/react-forms';
import { useContext } from 'react';
import { UseMutationResult } from '@tanstack/react-query';

import { I18nContext } from '../../../../contexts';
import { IBucketSettings, ITenantFull } from '../../../../types';

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
  };

  return (
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
  );
};
