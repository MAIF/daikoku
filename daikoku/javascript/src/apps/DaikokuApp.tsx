import { useContext, useEffect } from 'react';
import { Navigate } from 'react-router';
import { BrowserRouter, Route, BrowserRouter as Router, Routes } from 'react-router-dom';

import { TeamBackOffice } from '../components/backoffice/TeamBackOffice';
import { Footer, SideBar } from '../components/utils';
import { ModalProvider, NavProvider } from '../contexts';

import {
  ApiGroupHome,
  ApiHome,
  FrontOffice,
  JoinTeam,
  MaybeHomePage,
  MyHome,
  TeamHome,
  UnauthenticatedFooter,
  UnauthenticatedHome,
  UnauthenticatedTopBar,
  AtomicDesign
} from '../components/frontend';

import { MessagesProvider, MyProfile, NotificationList } from '../components/backoffice';

import {
  AdminMessages,
  AuditTrailList,
  CMSOffice,
  DaikokuTenantAdminList,
  ImportExport,
  InitializeFromOtoroshi,
  MailingInternalization,
  SessionList,
  TeamList,
  TeamMembersForAdmin,
  TenantAdminList,
  TenantEdit,
  TenantEditForAdmin,
  TenantList,
  TenantOtoroshi,
  TenantOtoroshis,
  TenantStyleEdit,
  UserEdit,
  UserList,
} from '../components/adminbackoffice';

import { TenantAssets } from '../components/adminbackoffice/tenants/TenantAssets';
import { FastMode } from "../components/frontend/fastMode/FastMode";
import { GlobalContext } from '../contexts/globalContext';
import { I18nContext } from '../contexts/i18n-context';
import { SessionModal } from '../contexts/modals/SessionModal';
import { MessagesEvents } from '../services/messages';
import { ResetPassword, Signup, TwoFactorAuthentication } from './DaikokuHomeApp';
import { ISession, IState, ITeamSimple, ITenant, IUserSimple } from '../types';
import {AnonymousReporting} from "../components/adminbackoffice/anonymousreporting/AnonymousReporting";

export const DaikokuApp = () => {
  const { connectedUser, session, tenant} = useContext(GlobalContext)

  useEffect(() => {
    if (!connectedUser.isGuest) {
      MessagesEvents.start();
      return () => {
        MessagesEvents.stop();
      };
    }
  }, [connectedUser]);

  const { translate } = useContext(I18nContext);

  if (!connectedUser) {
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
        <NavProvider>
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
                    path="/atomicDesign"
                    element={
                      <RouteWithTitle title={`${tenant.title} - ${translate('Notifications')}`}>
                        <AtomicDesign />
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
                    path="/settings/anonymous-reports"
                    element={
                      <RouteWithTitle
                        title={`${tenant.title} - ${translate('Anonymous reporting')}`}
                      >
                        <AnonymousReporting/>
                      </RouteWithTitle>
                    }
                  />
                  <Route
                    path="/settings/teams/:teamSettingId/members"
                    element={
                      <RouteWithTitle title={`${tenant.title} - ${translate({key: "Member", plural: true})}`}>
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
                    path="/apis/fast"
                    element={
                      <RouteWithTitle title={
                        translate({
                          key: "fastMode.title.page",
                          replacements: [tenant.title || tenant.name]
                        })}>
                        <FastMode/>
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

                  <Route
                    path="/:teamId/settings*"
                    element={<TeamBackOffice />}
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
              </div>
            </div>
            <Routes>
              {['/settings', '/notifications', '/me', '/:teamId/settings'].map((r) => (
                <Route key={r} path={r} element={<></>} />
              ))}
              <Route path="*" element={<Footer isBackOffice={false} />} />
            </Routes>
          </ModalProvider>

        </NavProvider>
      </MessagesProvider>
    </BrowserRouter>
  );
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
  const { connectedUser } = useContext(GlobalContext)
  if (connectedUser._humanReadableId) {
    return <Navigate to="/" />;
  }

  return <RouteWithTitle title={props.title}>{props.children}</RouteWithTitle>;
};
