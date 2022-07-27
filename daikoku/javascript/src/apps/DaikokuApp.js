import React, { useContext, useEffect, useState } from 'react';
import { BrowserRouter, BrowserRouter as Router, Route, Routes, useParams } from 'react-router-dom';
import { Navigate } from 'react-router';
import { connect, useDispatch, useSelector } from 'react-redux';
import ReduxToastr from 'react-redux-toastr';

import { ModalRoot } from '../components/frontend/modals/ModalRoot';
import { SideBar, Spinner, Error, Footer } from '../components/utils';
import * as Services from '../services';
import { updateTeamPromise, history, setError } from '../core';
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
  TenantEditForAdmin,
  TenantStyleEdit,
  UserList,
  UserEdit,
  AuditTrailList,
  SessionList,
  ImportExport,
  TeamEditForAdmin,
  TeamMembersForAdmin,
  TeamList,
  TenantAdminList,
  DaikokuTenantAdminList,
  InitializeFromOtoroshi,
  MailingInternalization,
  AdminMessages,
  CMSOffice,
} from '../components/adminbackoffice';

import { ResetPassword, Signup, TwoFactorAuthentication } from './DaikokuHomeApp';
import { MessagesEvents } from '../services/messages';
import { I18nContext } from '../locales/i18n-context';
import { TenantAssets } from '../components/adminbackoffice/tenants/TenantAssets';

const DaikokuAppComponent = ({ user, tenant, loginProvider, loginAction }) => {
  useEffect(() => {
    if (!user.isGuest) {
      MessagesEvents.start();
      return () => {
        MessagesEvents.stop();
      };
    }
  }, []);

  const { translateMethod } = useContext(I18nContext);

  if (!user) {
    return (
      <Router>
        <div
          role="root-container"
          className="container-fluid"
          style={{
            minHeight: '100vh',
            position: 'relative',
            paddingBottom: '6rem',
          }}
        >
          <Routes>
            <Route
              path="/"
              element={
                <>
                  <UnauthenticatedTopBar tenant={tenant} />
                  <UnauthenticatedHome tenant={tenant} />
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
    <BrowserRouter history={history}>
      <MessagesProvider>
        <NavProvider loginAction={loginAction} loginProvider={loginProvider}>
          <div className="d-flex flex-row">
            <SideBar />
            <div className="wrapper flex-grow-1">
              <Routes>
                <Route
                  path="/me"
                  element={
                    <RouteWithTitle title={`${tenant.title} - ${translateMethod('My profile')}`}>
                      <MyProfile />
                    </RouteWithTitle>
                  }
                />
                <Route
                  path="/2fa"
                  element={
                    <UnauthenticatedRoute
                      title={`${tenant.title} - ${translateMethod('Verification code')}`}
                      tenant={tenant}
                    >
                      <TwoFactorAuthentication
                        title={`${tenant.title} - ${translateMethod('Verification code')}`}
                      />
                    </UnauthenticatedRoute>
                  }
                />
                <Route
                  path="/reset"
                  element={
                    <UnauthenticatedRoute
                      title={`${tenant.title} - ${translateMethod('Reset password')}`}
                      tenant={tenant}
                    >
                      <ResetPassword />
                    </UnauthenticatedRoute>
                  }
                />
                <Route
                  path="/signup"
                  element={
                    <UnauthenticatedRoute
                      title={`${tenant.title} - ${translateMethod('Signup')}`}
                      tenant={tenant}
                    >
                      <Signup />
                    </UnauthenticatedRoute>
                  }
                />
                <Route
                  path="/notifications*"
                  element={
                    <RouteWithTitle title={`${tenant.title} - ${translateMethod('Notifications')}`}>
                      <NotificationList />
                    </RouteWithTitle>
                  }
                />
                <Route
                  path="/join"
                  element={
                    <FrontOfficeRoute title={`${tenant.title} - ${translateMethod('Join team')}`}>
                      <JoinTeam />
                    </FrontOfficeRoute>
                  }
                />
                <Route
                  path="/apis"
                  element={
                    <FrontOfficeRoute title={`${tenant.title} - ${translateMethod('Apis')}`}>
                      <MyHome />
                    </FrontOfficeRoute>
                  }
                />
                <Route
                  path="/"
                  element={
                    <FrontOfficeRoute title={`${tenant.title} - ${translateMethod('Home')}`}>
                      <MaybeHomePage tenant={tenant} />
                    </FrontOfficeRoute>
                  }
                />
                <Route
                  path="/settings/messages"
                  element={
                    <RouteWithTitle title={`${tenant.title} - ${translateMethod('Message', true)}`}>
                      <AdminMessages />
                    </RouteWithTitle>
                  }
                />
                <Route
                  path="/settings/otoroshis/:otoroshiId"
                  element={
                    <RouteWithTitle title={`${tenant.title} - ${translateMethod('Otoroshi')}`}>
                      <TenantOtoroshi tenant={tenant} />
                    </RouteWithTitle>
                  }
                />
                <Route
                  path="/settings/otoroshis"
                  element={
                    <RouteWithTitle
                      title={`${tenant.title} - ${translateMethod('Otoroshis', true)}`}
                    >
                      <TenantOtoroshis tenant={tenant} />
                    </RouteWithTitle>
                  }
                />
                <Route
                  path="/settings/settings"
                  element={
                    <RouteWithTitle
                      title={`${tenant.title} - ${translateMethod('Otoroshis', true)}`}
                    >
                      <TenantEdit tenant={tenant} />
                    </RouteWithTitle>
                  }
                />
                <Route
                  path="/settings/tenants/:tenantId"
                  element={
                    <RouteWithTitle title={`${tenant.title} - ${translateMethod('Tenant edit')}`}>
                      <TenantEditForAdmin />
                    </RouteWithTitle>
                  }
                />
                <Route
                  path="/settings/tenants/:tenantId/style"
                  element={
                    <RouteWithTitle title={`${tenant.title} - ${translateMethod('Style')}`}>
                      <TenantStyleEdit />
                    </RouteWithTitle>
                  }
                />
                <Route
                  path="/settings/tenants"
                  element={
                    <RouteWithTitle title={`${tenant.title} - ${translateMethod('Tenants', true)}`}>
                      <TenantList />
                    </RouteWithTitle>
                  }
                />
                <Route
                  path="/settings/tenants/:tenantId/admins"
                  element={
                    <RouteWithTitle title={`${tenant.title} - ${translateMethod('Admins')}`}>
                      <DaikokuTenantAdminList />
                    </RouteWithTitle>
                  }
                />
                <Route
                  path="/settings/users/:userId"
                  element={
                    <RouteWithTitle title={`${tenant.title} - ${translateMethod('User')}`}>
                      <UserEdit />
                    </RouteWithTitle>
                  }
                />
                <Route
                  path="/settings/users"
                  element={
                    <RouteWithTitle title={`${tenant.title} - ${translateMethod('Users', true)}`}>
                      <UserList />
                    </RouteWithTitle>
                  }
                />
                <Route
                  path="/settings/audit"
                  element={
                    <RouteWithTitle title={`${tenant.title} - ${translateMethod('Audit trail')}`}>
                      <AuditTrailList />
                    </RouteWithTitle>
                  }
                />
                <Route
                  path="/settings/sessions"
                  element={
                    <RouteWithTitle title={`${tenant.title} - ${translateMethod('User sessions')}`}>
                      <SessionList />
                    </RouteWithTitle>
                  }
                />
                <Route
                  path="/settings/import-export"
                  element={
                    <RouteWithTitle
                      title={`${tenant.title} - ${translateMethod('Import / Export')}`}
                    >
                      <ImportExport />
                    </RouteWithTitle>
                  }
                />
                <Route
                  path="/settings/teams/:teamSettingId"
                  element={
                    <RouteWithTitle title={`${tenant.title} - ${translateMethod('Team')}`}>
                      <TeamEditForAdmin />
                    </RouteWithTitle>
                  }
                />
                <Route
                  path="/settings/teams/:teamSettingId/members"
                  element={
                    <RouteWithTitle title={`${tenant.title} - ${translateMethod('Team members')}`}>
                      <TeamMembersForAdmin />
                    </RouteWithTitle>
                  }
                />
                <Route
                  path="/settings/teams"
                  element={
                    <RouteWithTitle title={`${tenant.title} - ${translateMethod('Teams')}`}>
                      <TeamList />
                    </RouteWithTitle>
                  }
                />
                <Route path="/settings/assets" element={<TenantAssets />} />
                <Route
                  path="/settings/admins"
                  element={
                    <RouteWithTitle title={`${tenant.title} - ${translateMethod('Admins')}`}>
                      <TenantAdminList tenantMode={true} />
                    </RouteWithTitle>
                  }
                />
                <Route
                  path="/settings/init"
                  element={
                    <RouteWithTitle title={`${tenant.title} - ${translateMethod('Init')}`}>
                      <InitializeFromOtoroshi />
                    </RouteWithTitle>
                  }
                />
                <Route
                  path="/settings/pages*"
                  element={
                    <RouteWithTitle
                      title={`${tenant.title} - ${translateMethod('daikokuapp.pages_title')}`}
                    >
                      <CMSOffice />
                    </RouteWithTitle>
                  }
                />
                {['/settings/internationalization', '/settings/internationalization/:domain'].map(
                  (r) => (
                    <Route
                      key={r}
                      path={r}
                      element={
                        <RouteWithTitle
                          title={`${tenant.title} - ${translateMethod('Internalization')}`}
                        >
                          <MailingInternalization tenant={tenant} />
                        </RouteWithTitle>
                      }
                    />
                  )
                )}
                {!tenant.hideTeamsPage && (
                  <Route
                    path="/teams"
                    element={
                      <FrontOfficeRoute title={`${tenant.title} - ${translateMethod('Teams')}`}>
                        <TeamChooser />
                      </FrontOfficeRoute>
                    }
                  />
                )}

                <Route
                  path="/:teamId/settings*"
                  element={<TeamBackOfficeRouter tenant={tenant} />}
                />

                <Route
                  path=":teamId/apigroups/:apiGroupId/:tab/*"
                  element={
                    <FrontOfficeRoute>
                      <ApiGroupHome />
                    </FrontOfficeRoute>
                  }
                />

                <Route
                  path="/:teamId/:apiId/:versionId/:tab/*"
                  element={
                    <FrontOfficeRoute>
                      {' '}
                      <ApiHome />{' '}
                    </FrontOfficeRoute>
                  }
                />

                <Route
                  path="/:teamId"
                  element={
                    <FrontOfficeRoute>
                      <TeamHome />
                    </FrontOfficeRoute>
                  }
                />
              </Routes>
              <Error />
            </div>
          </div>
          <ModalRoot />
          <ReduxToastr
            timeOut={4000}
            newestOnTop={false}
            position="top-right"
            transitionIn="fadeIn"
            transitionOut="fadeOut"
            closeOnToastrClick
          />
          <Routes>
            {['/settings', '/notifications', '/me', '/:teamId/settings'].map((r) => (
              <Route key={r} path={r} element={<></>} />
            ))}
            <Route path="/" element={<Footer isBackOffice={false} />} />
          </Routes>
        </NavProvider>
      </MessagesProvider>
    </BrowserRouter>
  );
};

const mapStateToProps = (state) => ({
  ...state.context,
  error: state.error,
});

export const DaikokuApp = connect(mapStateToProps)(DaikokuAppComponent);

//custom component route to get team object if it's not present in  redux store...

const TeamBackOfficeRouter = ({ tenant }) => {
  const { currentTeam } = useSelector((state) => state.context);

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
      if (team.error) dispatch(setError(team.error));
      else dispatch(updateTeamPromise(team));
      setLoading(false);
    });
  }

  if (!currentTeam || loading) return <Spinner />;
  else return <TeamBackOffice currentTeam={currentTeam} tenant={tenant} />;
};

const FrontOfficeRoute = (props) => {
  return (
    <RouteWithTitle {...props}>
      <FrontOffice>{props.children}</FrontOffice>
    </RouteWithTitle>
  );
};

const RouteWithTitle = (props) => {
  useEffect(() => {
    if (props.title) {
      document.title = props.title;
    }
  }, [props.title]);

  return props.children;
};

const UnauthenticatedRouteComponent = ({ connectedUser, children, title }) => {
  if (connectedUser._humanReadableId) {
    return <Navigate to="/" />;
  }

  return <RouteWithTitle title={title}>{children}</RouteWithTitle>;
};

const UnauthenticatedRoute = connect(mapStateToProps)(UnauthenticatedRouteComponent);
