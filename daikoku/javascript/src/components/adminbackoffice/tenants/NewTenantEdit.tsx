import { useMutation } from '@tanstack/react-query';
import React, { useContext } from 'react';
import { Route, Routes } from 'react-router-dom';
import { toastr } from 'react-redux-toastr';

import * as Services from '../../../services';
import { useTenantBackOffice } from '../../../contexts';
import { ITenantFull } from '../../../types/tenant';
import { AuditForm, AuthenticationForm, BucketForm, CustomizationForm, GeneralForm, MailForm } from './forms';
import { I18nContext } from '../../../locales/i18n-context';
import { SecurityForm } from './forms/SecurityForm';



export const NewTenantEdit = () => {
  const { translateMethod } = useContext(I18nContext)
  const { tenant } = useTenantBackOffice();

  const updateTenant = useMutation((tenant: ITenantFull) => Services.saveTenant(tenant), {
    onSuccess: data => {
      console.debug(data);
      toastr.success(translateMethod('Success'), translateMethod('Tenant updated successfully'))
    },
    onError: () => {
      toastr.error(translateMethod('Error'), translateMethod('Error'))
    }
  });

  return (
    <Routes>
      <Route
        path="/general"
        element={
          <GeneralForm tenant={tenant} updateTenant={updateTenant} />
        }
      />
      <Route
        path="/customization"
        element={
          <CustomizationForm tenant={tenant} updateTenant={updateTenant} />
        }
      />
      <Route
        path="/audit"
        element={
          <AuditForm tenant={tenant} updateTenant={updateTenant} />
        }
      />
      <Route
        path="/mail"
        element={
          <MailForm tenant={tenant} updateTenant={updateTenant} />
        }
      />
      <Route
        path="/authentication"
        element={
          <AuthenticationForm tenant={tenant} updateTenant={updateTenant} />
        }
      />
      <Route
        path="/bucket"
        element={
          <BucketForm tenant={tenant} updateTenant={updateTenant} />
        }
      />
      <Route
        path="/security"
        element={
          <SecurityForm tenant={tenant} updateTenant={updateTenant} />
        }
      />
    </Routes>
  )
}