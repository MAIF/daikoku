import { useContext } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toastr } from 'react-redux-toastr';
import { Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';

import { useDaikokuBackOffice, useTenantBackOffice } from '../../../contexts';
import { I18nContext } from '../../../contexts/i18n-context';
import * as Services from '../../../services';
import { ITenantFull } from '../../../types/tenant';
import { Spinner } from '../../utils/Spinner';
import { AuditForm, AuthenticationForm, BucketForm, CustomizationForm, GeneralForm, MailForm } from './forms';
import { SecurityForm } from './forms/SecurityForm';
import { ThirdPartyPaymentForm } from './forms/ThirdPartyPaymentForm';
import { isError } from '../../../types';

export const TenantEditComponent = ({ tenantId, fromDaikokuAdmin }: { tenantId: string, fromDaikokuAdmin?: boolean }) => {
  const { translate } = useContext(I18nContext)

  const navigate = useNavigate();
  const { state } = useLocation();

  const queryClient = useQueryClient()
  const { isLoading, data } = useQuery(['full-tenant'], () => Services.oneTenant(tenantId))
  const updateTenant = useMutation((tenant: ITenantFull) => Services.saveTenant(tenant), {
    onSuccess: () => {
      toastr.success(translate('Success'), translate('Tenant updated successfully'))
    },
    onError: () => { toastr.error(translate('Error'), translate('Error')) }
  });
  const createTenant = useMutation((tenant: ITenantFull) => Services.createTenant(tenant), {
    onSuccess: (createdTenant) => {
      navigate(`/settings/tenants/${createdTenant._humanReadableId}/general`)
      queryClient.invalidateQueries(['tenant'])
      toastr.success(translate('Success'), translate('Tenant created successfully'))
    },
    onError: () => { toastr.error(translate('Error'), translate('Error')) }
  });

  if (isLoading) {
    return (
      <Spinner />
    )
  } else if (data && !isError(data)) {
    return (
      <Routes>
        <Route
          path="/general"
          element={
            <>
              {fromDaikokuAdmin && <h1>{data?.name} - {translate('General')}</h1>}
              <GeneralForm tenant={state?.newTenant || data} creation={!!state?.newTenant} updateTenant={updateTenant} createTenant={createTenant} />
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
          path="/payment"
          element={
            <>
              {fromDaikokuAdmin && <h1>{data?.name} - {translate('Security')}</h1>}
              <ThirdPartyPaymentForm tenant={data} updateTenant={updateTenant} />
            </>
          }
        />
        <Route
          path="/security"
          element={
            <>
              {fromDaikokuAdmin && <h1>{data?.name} - {translate('Third-Party payment')}</h1>}
              <SecurityForm tenant={data} updateTenant={updateTenant} />
            </>
          }
        />
      </Routes>
    )
  } else {
    return <div>Error while fetching tenant</div>
  }
}

export const TenantEdit = ({ }) => {
  const { tenant } = useTenantBackOffice();

  return (
    <TenantEditComponent tenantId={tenant._id} />
  )
}

export const TenantEditForAdmin = ({ }) => {
  const { tenantId } = useParams();
  const { state } = useLocation();

  useDaikokuBackOffice({ creation: state?.newTenant });

  return (
    <TenantEditComponent tenantId={tenantId!} fromDaikokuAdmin={true} />
  )
}

