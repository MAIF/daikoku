import { useContext } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';

import { useDaikokuBackOffice, useTenantBackOffice } from '../../../contexts';
import { I18nContext } from '../../../contexts/i18n-context';
import * as Services from '../../../services';
import { ITenantFull } from '../../../types/tenant';
import { Spinner } from '../../utils/Spinner';
import { AuditForm, AuthenticationForm, BucketForm, CustomizationForm, GeneralForm, MailForm } from './forms';
import { SecurityForm } from './forms/SecurityForm';
import { ThirdPartyPaymentForm } from './forms/ThirdPartyPaymentForm';
import { ResponseError, isError } from '../../../types';
import { DisplayForm } from './forms/DisplayForm';

export const TenantEditComponent = ({ tenantId, fromDaikokuAdmin }: { tenantId: string, fromDaikokuAdmin?: boolean }) => {
  const { translate } = useContext(I18nContext)

  const navigate = useNavigate();
  const { state } = useLocation();

  const queryClient = useQueryClient()
  const { isLoading, data } = useQuery({
    queryKey: ['full-tenant'],
    queryFn: () => Services.oneTenant(tenantId),
    enabled: !state
  })
  const updateTenant = useMutation({
    mutationFn: (tenant: ITenantFull) => Services.saveTenant(tenant).then(r => isError(r) ? Promise.reject(r) : r),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["full-tenant"] });
      queryClient.invalidateQueries({ queryKey: ["context"] });
      toast.success(translate('Tenant updated successfully'))
    },
    onError: (e: ResponseError) => {
      toast.error(translate(e.error))
      //todo: reset forms
    }
  });
  const createTenant = useMutation({
    mutationFn: (tenant: ITenantFull) => Services.createTenant(tenant),
    onSuccess: (createdTenant) => {
      navigate(`/settings/tenants/${createdTenant._humanReadableId}/general`)
      queryClient.invalidateQueries({ queryKey: ['tenant'] })
      toast.success(translate({ key: 'tenant.created.success', replacements:[`${createdTenant.name}`]}))

    },
    onError: () => { toast.error(translate('Error')) }
  });

  if (isLoading && !state) {
    return (
      <Spinner />
    )
  } else if ((!!state && state.newTenant) || (data && !isError(data))) {
    const tenant: ITenantFull = state?.newTenant || data
    return (
      <Routes>
        <Route
          path="/general"
          element={
            <>
              {fromDaikokuAdmin && <h1>{tenant.name} - {translate('General')}</h1>}
              <GeneralForm tenant={tenant} creation={!!state && state.newTenant} updateTenant={updateTenant} createTenant={createTenant} />
            </>
          }
        />
        <Route
          path="/customization"
          element={
            <>
              {fromDaikokuAdmin && <h1>{tenant.name} - {translate('Customization')}</h1>}
              <CustomizationForm tenant={tenant} updateTenant={updateTenant} />
            </>
          }
        />
        <Route
          path="/audit"
          element={
            <>
              {fromDaikokuAdmin && <h1>{tenant.name} - {translate('Audit')}</h1>}
              <AuditForm tenant={tenant} updateTenant={updateTenant} />
            </>
          }
        />
        <Route
          path="/mail"
          element={
            <>
              {fromDaikokuAdmin && <h1>{tenant.name} - {translate('Mail')}</h1>}
              <MailForm tenant={tenant} updateTenant={updateTenant} />
            </>
          }
        />
        <Route
          path="/authentication"
          element={
            <>
              {fromDaikokuAdmin && <h1>{tenant.name} - {translate('Authentication')}</h1>}
              <AuthenticationForm tenant={tenant} updateTenant={updateTenant} />
            </>
          }
        />
        <Route
          path="/bucket"
          element={
            <>
              {fromDaikokuAdmin && <h1>{tenant.name} - {translate('Bucket')}</h1>}
              <BucketForm tenant={tenant} updateTenant={updateTenant} />
            </>
          }
        />
        <Route
          path="/payment"
          element={
            <>
              {fromDaikokuAdmin && <h1>{tenant.name} - {translate('Security')}</h1>}
              <ThirdPartyPaymentForm tenant={tenant} updateTenant={updateTenant} />
            </>
          }
        />
        <Route
          path="/security"
          element={
            <>
              {fromDaikokuAdmin && <h1>{tenant.name} - {translate('Third-Party payment')}</h1>}
              <SecurityForm tenant={tenant} updateTenant={updateTenant} />
            </>
          }
        />
        <Route
          path="/display-mode"
          element={
            <>
              {fromDaikokuAdmin && <h1>{tenant.name} - {translate('DisplayMode')}</h1>}
              <DisplayForm tenant={tenant} updateTenant={updateTenant} />
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

