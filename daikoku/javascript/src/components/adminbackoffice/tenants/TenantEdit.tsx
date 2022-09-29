import { useMutation, useQuery } from '@tanstack/react-query';
import React, { useContext } from 'react';
import { Route, Routes, useParams } from 'react-router-dom';
import { toastr } from 'react-redux-toastr';

import * as Services from '../../../services';
import { useTenantBackOffice, useDaikokuBackOffice } from '../../../contexts';
import { ITenant, ITenantFull } from '../../../types/tenant';
import { AuditForm, AuthenticationForm, BucketForm, CustomizationForm, GeneralForm, MailForm } from './forms';
import { I18nContext } from '../../../locales/i18n-context';
import { SecurityForm } from './forms/SecurityForm';
import { Spinner } from '../../utils/Spinner';

export const TenantEditComponent = ({ tenantId, fromDaikokuAdmin }: { tenantId: string, fromDaikokuAdmin?: boolean }) => {
  const { translate } = useContext(I18nContext)

  const { isLoading, data } = useQuery(['tenant'], () => Services.oneTenant(tenantId))
  const updateTenant = useMutation((tenant: ITenantFull) => Services.saveTenant(tenant), {
    onSuccess: data => {
      console.debug(data);
      toastr.success(translate('Success'), translate('Tenant updated successfully'))
    },
    onError: () => {
      toastr.error(translate('Error'), translate('Error'))
    }
  });

  if (isLoading) {
    return (
      <Spinner />
    )
  }

  return (
    <Routes>
      <Route
        path="/general"
        element={
          <>
            {fromDaikokuAdmin && <h1>{data?.name} - {translate('General')}</h1>}
            <GeneralForm tenant={data} updateTenant={updateTenant} />
          </>
        }
      />
      <Route
        path="/customization"
        element={
          <>
            {fromDaikokuAdmin && <h1>{data?.name} - {translate('Customization')}</h1>}
            <CustomizationForm tenant={data} updateTenant={updateTenant} />
          </>
        }
      />
      <Route
        path="/audit"
        element={
          <>
            {fromDaikokuAdmin && <h1>{data?.name} - {translate('Audit')}</h1>}
            <AuditForm tenant={data} updateTenant={updateTenant} />
          </>
        }
      />
      <Route
        path="/mail"
        element={
          <>
            {fromDaikokuAdmin && <h1>{data?.name} - {translate('Mail')}</h1>}
            <MailForm tenant={data} updateTenant={updateTenant} />
          </>
        }
      />
      <Route
        path="/authentication"
        element={
          <>
            {fromDaikokuAdmin && <h1>{data?.name} - {translate('Authentication')}</h1>}
            <AuthenticationForm tenant={data} updateTenant={updateTenant} />
          </>
        }
      />
      <Route
        path="/bucket"
        element={
          <>
            {fromDaikokuAdmin && <h1>{data?.name} - {translate('Bucket')}</h1>}
            <BucketForm tenant={data} updateTenant={updateTenant} />
          </>
        }
      />
      <Route
        path="/security"
        element={
          <>
            {fromDaikokuAdmin && <h1>{data?.name} - {translate('Security')}</h1>}
            <SecurityForm tenant={data} updateTenant={updateTenant} />
          </>
        }
      />
    </Routes>
  )
}

export const TenantEdit = ({ }) => {
  const { tenant } = useTenantBackOffice();

  return (
    <TenantEditComponent tenantId={tenant._id} />
  )
}

export const TenantEditForAdmin = ({ }) => {
  useDaikokuBackOffice();

  const { tenantId } = useParams();

  return (
    <TenantEditComponent tenantId={tenantId!} fromDaikokuAdmin={true} />
  )
}

