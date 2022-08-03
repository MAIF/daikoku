import React, { useContext, useEffect, useState } from 'react';
import { BrowserRouter, BrowserRouter as Router, Route, Routes, useParams } from 'react-router-dom';
import { Navigate } from 'react-router';
import { connect, useDispatch, useSelector } from 'react-redux';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import ReduxToastr from 'react-redux-toastr';

// @ts-expect-error TS(6142): Module '../components/frontend/modals/ModalRoot' w... Remove this comment to see the full error message
import { ModalRoot } from '../components/frontend/modals/ModalRoot';
import { SideBar, Spinner, Error, Footer } from '../components/utils';
import * as Services from '../services';
import { updateTeamPromise, history, setError } from '../core';
// @ts-expect-error TS(6142): Module '../components/backoffice/TeamBackOffice' w... Remove this comment to see the full error message
import { TeamBackOffice } from '../components/backoffice/TeamBackOffice';
import { NavProvider } from '../contexts';

import 'react-redux-toastr/src/styles/index.scss';

import {
  TeamChooser,
  TeamHome,
  MyHome,
  MaybeHomePage,
  ApiHome,
  ApiGroupHome,
  UnauthenticatedHome,
  UnauthenticatedTopBar,
  UnauthenticatedFooter,
  FrontOffice,
  JoinTeam,
} from '../components/frontend';

import {
  NotificationList,
  MyProfile,
  MessagesProvider,
} from '../components/backoffice';

import {
  TenantOtoroshi,
  TenantOtoroshis,
  TenantList,
  TenantEdit,
  // @ts-expect-error TS(2305): Module '"../components/adminbackoffice"' has no ex... Remove this comment to see the full error message
  NewTenantEdit,
  TenantEditForAdmin,
  TenantStyleEdit,
  UserList,
  UserEdit,
  AuditTrailList,
  SessionList,
  ImportExport,
  TeamMembersForAdmin,
  TeamList,
  TenantAdminList,
  DaikokuTenantAdminList,
  InitializeFromOtoroshi,
  MailingInternalization,
  AdminMessages,
  CMSOffice,
} from '../components/adminbackoffice';

// @ts-expect-error TS(6142): Module './DaikokuHomeApp' was resolved to '/Users/... Remove this comment to see the full error message
import { ResetPassword, Signup, TwoFactorAuthentication } from './DaikokuHomeApp';
import { MessagesEvents } from '../services/messages';
// @ts-expect-error TS(6142): Module '../locales/i18n-context' was resolved to '... Remove this comment to see the full error message
import { I18nContext } from '../locales/i18n-context';
// @ts-expect-error TS(6142): Module '../components/adminbackoffice/tenants/Tena... Remove this comment to see the full error message
import { TenantAssets } from '../components/adminbackoffice/tenants/TenantAssets';

const DaikokuAppComponent = ({
  user,
  tenant,
  loginProvider,
  loginAction
}: any) => {
  useEffect(() => {
    if (!user.isGuest) {
      MessagesEvents.start();
      return () => {
        MessagesEvents.stop();
      };
    }
  }, []);

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  if (!user) {
    return (
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <Router>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div
          role="root-container"
          className="container-fluid"
          style={{
            minHeight: '100vh',
            position: 'relative',
            paddingBottom: '6rem',
          }}
        >
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Routes>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Route
              path="/"
              element={
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <UnauthenticatedTopBar tenant={tenant} />
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <UnauthenticatedHome tenant={tenant} />
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <UnauthenticatedFooter tenant={tenant} />
                </>
              }
            />
          </Routes>
        </div>
      </Router>
    );
  }
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <BrowserRouter history={history}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <MessagesProvider>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <NavProvider loginAction={loginAction} loginProvider={loginProvider}>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="d-flex flex-row">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <SideBar />
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="wrapper flex-grow-1">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Routes>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Route
                  path="/me"
                  element={
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <RouteWithTitle title={`${tenant.title} - ${translateMethod('My profile')}`}>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <MyProfile />
                    </RouteWithTitle>
                  }
                />
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Route
                  path="/2fa"
                  element={
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <UnauthenticatedRoute
                      // @ts-expect-error TS(2322): Type '{ children: Element; title: string; tenant: ... Remove this comment to see the full error message
                      title={`${tenant.title} - ${translateMethod('Verification code')}`}
                      tenant={tenant}
                    >
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <TwoFactorAuthentication
                        title={`${tenant.title} - ${translateMethod('Verification code')}`}
                      />
                    </UnauthenticatedRoute>
                  }
                />
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Route
                  path="/reset"
                  element={
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <UnauthenticatedRoute
                      // @ts-expect-error TS(2322): Type '{ children: Element; title: string; tenant: ... Remove this comment to see the full error message
                      title={`${tenant.title} - ${translateMethod('Reset password')}`}
                      tenant={tenant}
                    >
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <ResetPassword />
                    </UnauthenticatedRoute>
                  }
                />
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Route
                  path="/signup"
                  element={
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <UnauthenticatedRoute
                      // @ts-expect-error TS(2322): Type '{ children: Element; title: string; tenant: ... Remove this comment to see the full error message
                      title={`${tenant.title} - ${translateMethod('Signup')}`}
                      tenant={tenant}
                    >
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <Signup />
                    </UnauthenticatedRoute>
                  }
                />
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Route
                  path="/notifications*"
                  element={
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <RouteWithTitle title={`${tenant.title} - ${translateMethod('Notifications')}`}>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <NotificationList />
                    </RouteWithTitle>
                  }
                />
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Route
                  path="/join"
                  element={
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <FrontOfficeRoute title={`${tenant.title} - ${translateMethod('Join team')}`}>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <JoinTeam />
                    </FrontOfficeRoute>
                  }
                />
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Route
                  path="/apis"
                  element={
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <FrontOfficeRoute title={`${tenant.title} - ${translateMethod('Apis')}`}>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <MyHome />
                    </FrontOfficeRoute>
                  }
                />
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Route
                  path="/"
                  element={
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <FrontOfficeRoute title={`${tenant.title} - ${translateMethod('Home')}`}>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <MaybeHomePage tenant={tenant} />
                    </FrontOfficeRoute>
                  }
                />
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Route
                  path="/settings/messages"
                  element={
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <RouteWithTitle title={`${tenant.title} - ${translateMethod('Message', true)}`}>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <AdminMessages />
                    </RouteWithTitle>
                  }
                />
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Route
                  path="/settings/otoroshis/:otoroshiId"
                  element={
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <RouteWithTitle title={`${tenant.title} - ${translateMethod('Otoroshi')}`}>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <TenantOtoroshi tenant={tenant} />
                    </RouteWithTitle>
                  }
                />
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Route
                  path="/settings/otoroshis"
                  element={
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <RouteWithTitle
                      title={`${tenant.title} - ${translateMethod('Otoroshis', true)}`}
                    >
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <TenantOtoroshis tenant={tenant} />
                    </RouteWithTitle>
                  }
                />
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Route
                  path="/settings/settings*"
                  element={
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <RouteWithTitle
                      title={`${tenant.title} - ${translateMethod('Otoroshis', true)}`}
                    >
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <NewTenantEdit tenant={tenant} />
                    </RouteWithTitle>
                  }
                />
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Route
                  path="/settings/settings/old"
                  element={
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <RouteWithTitle
                      title={`${tenant.title} - ${translateMethod('Otoroshis', true)}`}
                    >
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <TenantEdit tenant={tenant} />
                    </RouteWithTitle>
                  }
                />
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Route
                  path="/settings/tenants/:tenantId"
                  element={
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <RouteWithTitle title={`${tenant.title} - ${translateMethod('Tenant edit')}`}>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <TenantEditForAdmin />
                    </RouteWithTitle>
                  }
                />
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Route
                  path="/settings/tenants/:tenantId/style"
                  element={
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <RouteWithTitle title={`${tenant.title} - ${translateMethod('Style')}`}>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <TenantStyleEdit />
                    </RouteWithTitle>
                  }
                />
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Route
                  path="/settings/tenants"
                  element={
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <RouteWithTitle title={`${tenant.title} - ${translateMethod('Tenants', true)}`}>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <TenantList />
                    </RouteWithTitle>
                  }
                />
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Route
                  path="/settings/tenants/:tenantId/admins"
                  element={
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <RouteWithTitle title={`${tenant.title} - ${translateMethod('Admins')}`}>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <DaikokuTenantAdminList />
                    </RouteWithTitle>
                  }
                />
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Route
                  path="/settings/users/:userId"
                  element={
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <RouteWithTitle title={`${tenant.title} - ${translateMethod('User')}`}>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <UserEdit />
                    </RouteWithTitle>
                  }
                />
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Route
                  path="/settings/users"
                  element={
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <RouteWithTitle title={`${tenant.title} - ${translateMethod('Users', true)}`}>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <UserList />
                    </RouteWithTitle>
                  }
                />
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Route
                  path="/settings/audit"
                  element={
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <RouteWithTitle title={`${tenant.title} - ${translateMethod('Audit trail')}`}>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <AuditTrailList />
                    </RouteWithTitle>
                  }
                />
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Route
                  path="/settings/sessions"
                  element={
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <RouteWithTitle title={`${tenant.title} - ${translateMethod('User sessions')}`}>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <SessionList />
                    </RouteWithTitle>
                  }
                />
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Route
                  path="/settings/import-export"
                  element={
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <RouteWithTitle
                      title={`${tenant.title} - ${translateMethod('Import / Export')}`}
                    >
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <ImportExport />
                    </RouteWithTitle>
                  }
                />
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Route
                  path="/settings/teams/:teamSettingId/members"
                  element={
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <RouteWithTitle title={`${tenant.title} - ${translateMethod('Team members')}`}>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <TeamMembersForAdmin />
                    </RouteWithTitle>
                  }
                />
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Route
                  path="/settings/teams"
                  element={
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <RouteWithTitle title={`${tenant.title} - ${translateMethod('Teams')}`}>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <TeamList />
                    </RouteWithTitle>
                  }
                />
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Route path="/settings/assets" element={<TenantAssets />} />
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Route
                  path="/settings/admins"
                  element={
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <RouteWithTitle title={`${tenant.title} - ${translateMethod('Admins')}`}>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <TenantAdminList tenantMode={true} />
                    </RouteWithTitle>
                  }
                />
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Route
                  path="/settings/init"
                  element={
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <RouteWithTitle title={`${tenant.title} - ${translateMethod('Init')}`}>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <InitializeFromOtoroshi />
                    </RouteWithTitle>
                  }
                />
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Route
                  path="/settings/pages*"
                  element={
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <RouteWithTitle
                      title={`${tenant.title} - ${translateMethod('daikokuapp.pages_title')}`}
                    >
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <CMSOffice />
                    </RouteWithTitle>
                  }
                />
                {['/settings/internationalization', '/settings/internationalization/:domain'].map(
                  (r) => (
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <Route
                      key={r}
                      path={r}
                      element={
                        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                        <RouteWithTitle
                          title={`${tenant.title} - ${translateMethod('Internalization')}`}
                        >
                          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                          <MailingInternalization tenant={tenant} />
                        </RouteWithTitle>
                      }
                    />
                  )
                )}
                {!tenant.hideTeamsPage && (
                  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                  <Route
                    path="/teams"
                    element={
                      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                      <FrontOfficeRoute title={`${tenant.title} - ${translateMethod('Teams')}`}>
                        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <TeamChooser />
                      </FrontOfficeRoute>
                    }
                  />
                )}

                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Route
                  path="/:teamId/settings*"
                  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                  element={<TeamBackOfficeRouter tenant={tenant} />}
                />

                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Route
                  path=":teamId/apigroups/:apiGroupId/:tab/*"
                  element={
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <FrontOfficeRoute>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <ApiGroupHome />
                    </FrontOfficeRoute>
                  }
                />

                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Route
                  path="/:teamId/:apiId/:versionId/:tab/*"
                  element={
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <FrontOfficeRoute>
                      {' '}
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <ApiHome />{' '}
                    </FrontOfficeRoute>
                  }
                />

                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Route
                  path="/:teamId"
                  element={
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <FrontOfficeRoute>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <TeamHome />
                    </FrontOfficeRoute>
                  }
                />
              </Routes>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Error />
            </div>
          </div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <ModalRoot />
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <ReduxToastr
            timeOut={4000}
            newestOnTop={false}
            position="top-right"
            transitionIn="fadeIn"
            transitionOut="fadeOut"
            closeOnToastrClick
          />
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Routes>
            {['/settings', '/notifications', '/me', '/:teamId/settings'].map((r) => (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <Route key={r} path={r} element={<></>} />
            ))}
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Route path="/" element={<Footer isBackOffice={false} />} />
          </Routes>
        </NavProvider>
      </MessagesProvider>
    </BrowserRouter>
  );
};

const mapStateToProps = (state: any) => ({
  ...state.context,
  error: state.error
});

export const DaikokuApp = connect(mapStateToProps)(DaikokuAppComponent);

//custom component route to get team object if it's not present in  redux store...

const TeamBackOfficeRouter = ({
  tenant
}: any) => {
  const { currentTeam } = useSelector((state) => (state as any).context);

  const dispatch = useDispatch();
  const params = useParams();

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentTeam || params.teamId !== currentTeam._humanReadableId) {
      setLoading(true);
      getMyTeam();
    } else setLoading(false);
  }, [params.teamId]);

  function getMyTeam() {
    Services.oneOfMyTeam(params.teamId).then((team) => {
      // @ts-expect-error TS(2345): Argument of type '(dispatch: any) => any' is not a... Remove this comment to see the full error message
      if (team.error) dispatch(setError(team.error));
      // @ts-expect-error TS(2345): Argument of type '(dispatch: any) => Promise<any>'... Remove this comment to see the full error message
      else dispatch(updateTeamPromise(team));
      setLoading(false);
    });
  }

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  if (!currentTeam || loading) return <Spinner />;
  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  else return <TeamBackOffice currentTeam={currentTeam} tenant={tenant} />;
};

const FrontOfficeRoute = (props: any) => {
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <RouteWithTitle {...props}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <FrontOffice>{props.children}</FrontOffice>
    </RouteWithTitle>
  );
};

const RouteWithTitle = (props: any) => {
  useEffect(() => {
    if (props.title) {
      document.title = props.title;
    }
  }, [props.title]);

  return props.children;
};

const UnauthenticatedRouteComponent = ({
  connectedUser,
  children,
  title
}: any) => {
  if (connectedUser._humanReadableId) {
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    return <Navigate to="/" />;
  }

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return <RouteWithTitle title={title}>{children}</RouteWithTitle>;
};

const UnauthenticatedRoute = connect(mapStateToProps)(UnauthenticatedRouteComponent);
