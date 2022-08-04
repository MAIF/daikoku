import React from 'react';
import { Route, Routes } from 'react-router-dom';

import { useTenantBackOffice } from '../../../contexts';
import {AuditForm, AuthenticationForm, CustomizationForm, GeneralForm, MailForm} from './forms';



export const NewTenantEdit = () => {
    const { tenant } = useTenantBackOffice();

  return (
        <Routes>
            <Route
        path="/general"
        element={
                    <GeneralForm tenant={tenant} />
        }
      />
            <Route
        path="/customization"
        element={
                    <CustomizationForm tenant={tenant} />
        }
      />
            <Route
        path="/audit"
        element={
                    <AuditForm tenant={tenant} />
        }
      />
            <Route
        path="/mail"
        element={
                    <MailForm tenant={tenant} />
        }
      />
            <Route
        path="/authentication"
        element={
                    <AuthenticationForm tenant={tenant} />
        }
      />
    </Routes>
  )
}