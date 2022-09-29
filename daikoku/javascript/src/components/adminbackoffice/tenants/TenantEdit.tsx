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
import { use } from 'chai';
import { Spinner } from '../../utils/Spinner';

export const TenantEditComponent = ({tenantId}: {tenantId: string}) => {
  const { translateMethod } = useContext(I18nContext)

  const { isLoading, data } = useQuery(['tenant'], () => Services.oneTenant(tenantId))
  const updateTenant = useMutation((tenant: ITenantFull) => Services.saveTenant(tenant), {
    onSuccess: data => {
      console.debug(data);
      toastr.success(translateMethod('Success'), translateMethod('Tenant updated successfully'))
    },
    onError: () => {
      toastr.error(translateMethod('Error'), translateMethod('Error'))
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
          <GeneralForm tenant={data} updateTenant={updateTenant} />
        }
      />
      <Route
        path="/customization"
        element={
          <CustomizationForm tenant={data} updateTenant={updateTenant} />
        }
      />
      <Route
        path="/audit"
        element={
          <AuditForm tenant={data} updateTenant={updateTenant} />
        }
      />
      <Route
        path="/mail"
        element={
          <MailForm tenant={data} updateTenant={updateTenant} />
        }
      />
      <Route
        path="/authentication"
        element={
          <AuthenticationForm tenant={data} updateTenant={updateTenant} />
        }
      />
      <Route
        path="/bucket"
        element={
          <BucketForm tenant={data} updateTenant={updateTenant} />
        }
      />
      <Route
        path="/security"
        element={
          <SecurityForm tenant={data} updateTenant={updateTenant} />
        }
      />
    </Routes>
  )
}

export const TenantEdit = ({}) => {
  const {tenant} = useTenantBackOffice();

  return (
    <TenantEditComponent tenantId={tenant._id} />
  )
}

export const TenantEditForAdmin = ({}) => {
  useDaikokuBackOffice();

  const {tenantId} = useParams();

  return (
    <TenantEditComponent tenantId={tenantId!} />
  )
}

