import React, { useContext, useEffect, useState } from 'react';
import { BrowserRouter, BrowserRouter as Router, Route, Routes, useParams } from 'react-router-dom';
import { Navigate } from 'react-router';
import { connect, useDispatch, useSelector } from 'react-redux';
import ReduxToastr from 'react-redux-toastr';

import { ModalRoot } from '../components/frontend/modals/ModalRoot';
import { SideBar, Spinner, Error, Footer } from '../components/utils';
import * as Services from '../services';
import { updateTeamPromise, setError } from '../core';
import { TeamBackOffice } from '../components/backoffice/TeamBackOffice';
import { ModalProvider, NavProvider } from '../contexts';

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

import { NotificationList, MyProfile, MessagesProvider } from '../components/backoffice';

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
import { I18nContext } from '../contexts/i18n-context';
import { TenantAssets } from '../components/adminbackoffice/tenants/TenantAssets';
import { SessionModal } from '../components/frontend/modals/SessionModal';
import { ISession, IState, ITeamSimple, ITenant, IUserSimple } from '../types';

type DaikokuAppProps = {
  session: ISession,
  user: IUserSimple,
  tenant: ITenant,
  loginProvider: string,
  loginAction: string
}
export const DaikokuApp = ({
  user,
  tenant,
  loginProvider,
  loginAction,
  session
}: DaikokuAppProps) => {
  useEffect(() => {
    if (!user.isGuest) {
      MessagesEvents.start();
      return () => {
        MessagesEvents.stop();
      };
    }
  }, []);

  const { translate } = useContext(I18nContext);

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
                  <UnauthenticatedTopBar />
                  <UnauthenticatedHome />
                  <UnauthenticatedFooter />
                </>
              }
            />
          </Routes>
        </div>
        <SessionModal session={session} />
      </Router>
    );
  }

  return (
    <BrowserRouter>
      <MessagesProvider>
        <NavProvider loginAction={loginAction} loginProvider={loginProvider}>
          <ModalProvider>
            <div className="d-flex flex-row">
              <SideBar />
              <div className="wrapper flex-grow-1">
                <Routes>
                  <Route
                    path="/me"
                    element={
                      <RouteWithTitle title={`${tenant.title} - ${translate('My profile')}`}>
                        <MyProfile />
                      </RouteWithTitle>
                    }
                  />
                  <Route
                    path="/2fa"
                    element={
                      <UnauthenticatedRoute title={`${tenant.title} - ${translate('Verification code')}`} >
                        <TwoFactorAuthentication
                          title={`${tenant.title} - ${translate('Verification code')}`}
                        />
                      </UnauthenticatedRoute>
                    }
                  />
                  <Route
                    path="/reset"
                    element={
                      <UnauthenticatedRoute title={`${tenant.title} - ${translate('Reset password')}`}>
                        <ResetPassword />
                      </UnauthenticatedRoute>
                    }
                  />
                  <Route
                    path="/signup"
                    element={
                      <UnauthenticatedRoute title={`${tenant.title} - ${translate('Signup')}`} >
                        <Signup />
                      </UnauthenticatedRoute>
                    }
                  />
                  <Route
                    path="/notifications*"
                    element={
                      <RouteWithTitle title={`${tenant.title} - ${translate('Notifications')}`}>
                        <NotificationList />
                      </RouteWithTitle>
                    }
                  />
                  <Route
                    path="/join"
                    element={
                      <FrontOfficeRoute title={`${tenant.title} - ${translate('Join team')}`}>
                        <JoinTeam />
                      </FrontOfficeRoute>
                    }
                  />
                  <Route
                    path="/apis"
                    element={
                      <FrontOfficeRoute title={`${tenant.title} - ${translate('Apis')}`}>
                        <MyHome />
                      </FrontOfficeRoute>
                    }
                  />
                  <Route
                    path="/"
                    element={
                      <FrontOfficeRoute title={`${tenant.title} - ${translate('Home')}`}>
                        <MaybeHomePage tenant={tenant} />
                      </FrontOfficeRoute>
                    }
                  />
                  <Route
                    path="/settings/messages"
                    element={
                      <RouteWithTitle title={`${tenant.title} - ${translate({ key: 'Message', plural: true })}`}>
                        <AdminMessages />
                      </RouteWithTitle>
                    }
                  />
                  <Route
                    path="/settings/otoroshis/:otoroshiId"
                    element={
                      <RouteWithTitle title={`${tenant.title} - ${translate('Otoroshi')}`}>
                        <TenantOtoroshi />
                      </RouteWithTitle>
                    }
                  />
                  <Route
                    path="/settings/otoroshis"
                    element={
                      <RouteWithTitle
                        title={`${tenant.title} - ${translate({ key: 'Otoroshis', plural: true })}`}
                      >
                        <TenantOtoroshis />
                      </RouteWithTitle>
                    }
                  />
                  <Route
                    path="/settings/settings*"
                    element={
                      <RouteWithTitle
                        title={`${tenant.title} - ${translate({ key: 'Tenant edit', plural: true })}`}
                      >
                        <TenantEdit />
                      </RouteWithTitle>
                    }
                  />
                  <Route
                    path="/settings/tenants/:tenantId*"
                    element={
                      <RouteWithTitle title={`${tenant.title} - ${translate('Tenant edit')}`}>
                        <TenantEditForAdmin />
                      </RouteWithTitle>
                    }
                  />
                  <Route
                    path="/settings/tenants/:tenantId/style"
                    element={
                      <RouteWithTitle title={`${tenant.title} - ${translate('Style')}`}>
                        <TenantStyleEdit />
                      </RouteWithTitle>
                    }
                  />
                  <Route
                    path="/settings/tenants"
                    element={
                      <RouteWithTitle title={`${tenant.title} - ${translate({ key: 'Tenants', plural: true })}`}>
                        <TenantList />
                      </RouteWithTitle>
                    }
                  />
                  <Route
                    path="/settings/tenants/:tenantId/admins"
                    element={
                      <RouteWithTitle title={`${tenant.title} - ${translate('Admins')}`}>
                        <DaikokuTenantAdminList />
                      </RouteWithTitle>
                    }
                  />
                  <Route
                    path="/settings/users/:userId"
                    element={
                      <RouteWithTitle title={`${tenant.title} - ${translate('User')}`}>
                        <UserEdit />
                      </RouteWithTitle>
                    }
                  />
                  <Route
                    path="/settings/users"
                    element={
                      <RouteWithTitle title={`${tenant.title} - ${translate({ key: 'Users', plural: true })}`}>
                        <UserList />
                      </RouteWithTitle>
                    }
                  />
                  <Route
                    path="/settings/audit"
                    element={
                      <RouteWithTitle title={`${tenant.title} - ${translate('Audit trail')}`}>
                        <AuditTrailList />
                      </RouteWithTitle>
                    }
                  />
                  <Route
                    path="/settings/sessions"
                    element={
                      <RouteWithTitle title={`${tenant.title} - ${translate('User sessions')}`}>
                        <SessionList />
                      </RouteWithTitle>
                    }
                  />
                  <Route
                    path="/settings/import-export"
                    element={
                      <RouteWithTitle
                        title={`${tenant.title} - ${translate('Import / Export')}`}
                      >
                        <ImportExport />
                      </RouteWithTitle>
                    }
                  />
                  <Route
                    path="/settings/teams/:teamSettingId/members"
                    element={
                      <RouteWithTitle title={`${tenant.title} - ${translate('Team members')}`}>
                        <TeamMembersForAdmin />
                      </RouteWithTitle>
                    }
                  />
                  <Route
                    path="/settings/teams"
                    element={
                      <RouteWithTitle title={`${tenant.title} - ${translate('Teams')}`}>
                        <TeamList />
                      </RouteWithTitle>
                    }
                  />
                  <Route path="/settings/assets" element={<TenantAssets />} />
                  <Route
                    path="/settings/admins"
                    element={
                      <RouteWithTitle title={`${tenant.title} - ${translate('Admins')}`}>
                        <TenantAdminList />
                      </RouteWithTitle>
                    }
                  />
                  <Route
                    path="/settings/init"
                    element={
                      <RouteWithTitle title={`${tenant.title} - ${translate('Init')}`}>
                        <InitializeFromOtoroshi />
                      </RouteWithTitle>
                    }
                  />
                  <Route
                    path="/settings/pages*"
                    element={
                      <RouteWithTitle
                        title={`${tenant.title} - ${translate('daikokuapp.pages_title')}`}
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
                            title={`${tenant.title} - ${translate('Internalization')}`}
                          >
                            <MailingInternalization />
                          </RouteWithTitle>
                        }
                      />
                    )
                  )}
                  {!tenant.hideTeamsPage && (
                    <Route
                      path="/teams"
                      element={
                        <FrontOfficeRoute title={`${tenant.title} - ${translate('Teams')}`}>
                          <TeamChooser />
                        </FrontOfficeRoute>
                      }
                    />
                  )}

                  <Route
                    path="/:teamId/settings*"
                    element={<TeamBackOfficeRouter />}
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
                        <ApiHome />
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
          </ModalProvider>

        </NavProvider>
      </MessagesProvider>
    </BrowserRouter>
  );
};

//custom component route to get team object if it's not present in  redux store...

const TeamBackOfficeRouter = () => {
  const currentTeam = useSelector<IState, ITeamSimple>((state) => state.context.currentTeam);

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
    Services.oneOfMyTeam(params.teamId)
      .then((team) => {
        if (team.error) {
          setError(team.error)(dispatch);
        }
        else {
          updateTeamPromise(team)(dispatch);
        }
        setLoading(false);
      });
  }

  if (!currentTeam || loading) return <Spinner />;
  else return <TeamBackOffice isLoading={loading} />;
};

const FrontOfficeRoute = (props: { title?: string, children: JSX.Element }) => {
  return (
    <RouteWithTitle {...props}>
      <FrontOffice>{props.children}</FrontOffice>
    </RouteWithTitle>
  );
};

const RouteWithTitle = (props: { title?: string, children: JSX.Element }) => {
  useEffect(() => {
    if (props.title) {
      document.title = props.title;
    }
  }, [props.title]);

  return props.children;
};

const UnauthenticatedRoute = (props: { children: JSX.Element, title: string }) => {
  const connectedUser = useSelector<IState, IUserSimple>(s => s.context.connectedUser)
  if (connectedUser._humanReadableId) {
    return <Navigate to="/" />;
  }

  return <RouteWithTitle title={props.title}>{props.children}</RouteWithTitle>;
};
