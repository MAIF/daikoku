import React from 'react';
import { Route, Routes } from 'react-router-dom';

import { useTenantBackOffice } from '../../../contexts';
import {AuditForm, AuthenticationForm, CustomizationForm, GeneralForm, MailForm} from './forms';



export const NewTenantEdit = () => {
  // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
  const { tenant } = useTenantBackOffice();

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Routes>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Route
        path="/general"
        element={
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <GeneralForm tenant={tenant} />
        }
      />
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Route
        path="/customization"
        element={
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <CustomizationForm tenant={tenant} />
        }
      />
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Route
        path="/audit"
        element={
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <AuditForm tenant={tenant} />
        }
      />
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Route
        path="/mail"
        element={
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <MailForm tenant={tenant} />
        }
      />
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Route
        path="/authentication"
        element={
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <AuthenticationForm tenant={tenant} />
        }
      />
    </Routes>
  )
}