import { Form, Schema, type } from '@maif/react-forms';
import { useMutation, UseMutationResult, useQuery } from '@tanstack/react-query';
import { useContext } from 'react';
import { toastr } from 'react-redux-toastr';


import { I18nContext } from '../../../../core';
import * as Services from '../../../../services';
import { IBucketSettings, ITenant, ITenantFull } from '../../../../types';
import { Spinner } from '../../../utils';

export const BucketForm = (props: { tenant: ITenant, updateTenant: UseMutationResult<any, unknown, ITenantFull, unknown> }) => {
    const { translateMethod } = useContext(I18nContext)
    const { isLoading, data } = useQuery(['tenant'], () => Services.oneTenant(props.tenant._id))

    const schema: Schema = {
        bucket: {
            type: type.string,
            label: translateMethod('Bucket name'),
            placeholder: 'daikoku-tenant-1',
            help: translateMethod('The name of the S3 bucket'),

        },
        endpoint: {
            type: type.string,
            label: translateMethod('Bucket url'),
            help: translateMethod('The url of the bucket'),

        },
        region: {
            type: type.string,
            label: translateMethod('S3 region'),
            placeholder: 'us-west-2',
            help: translateMethod('The region of the bucket'),
        },
        access: {
            type: type.string,
            label: translateMethod('Bucket access key'),
            help: translateMethod('The access key to access bucket'),
        },
        secret: {
            type: type.string,
            label: translateMethod('Bucket secret'),
            help: translateMethod('The secret to access the bucket'),
        },
        chunkSize: {
            type: type.number,
            label: translateMethod('Chunk size'),
            defaultValue: 1024 * 1024 * 8,
            help: translateMethod('The size of each chunk sent'),
        },
        v4auth: {
            type: type.bool,
            label: translateMethod('Use V4 auth.'),
            defaultValue: true
        },
    }

    if (isLoading) {
        return (
            <Spinner />
        )
    }

    return (
        <Form<IBucketSettings> 
            schema={schema}
            onSubmit={(r) => props.updateTenant.mutateAsync({...data, bucketSettings: r} as ITenantFull)}
            value={data?.bucketSettings}
        />
    )

}