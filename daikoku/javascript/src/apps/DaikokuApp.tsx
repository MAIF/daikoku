import { useContext, useEffect } from 'react';
import { Navigate, Outlet } from 'react-router';
import { BrowserRouter, Route, BrowserRouter as Router, Routes, createBrowserRouter, RouterProvider, ScrollRestoration, useSearchParams } from 'react-router-dom';

import { TeamBackOffice } from '../components/backoffice/TeamBackOffice';
import { Footer, LoginPage, SideBar } from '../components/utils';
import { ModalProvider, NavProvider } from '../contexts';

import {
  ApiHome,
  FrontOffice,
  JoinTeam,
  MaybeHomePage,
  MyHome,
  TeamHome,
  AtomicDesign,
  SubscriptionRetrieve
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
  UserEdit,
  UserList,
} from '../components/adminbackoffice';
import { Error, Response } from '../components/utils';
import { TenantAssets } from '../components/adminbackoffice/tenants/TenantAssets';
import { FastMode } from "../components/frontend/fastMode/FastMode";
import { GlobalContext } from '../contexts/globalContext';
import { I18nContext } from '../contexts/i18n-context';
import { MessagesEvents } from '../services/messages';
import { ResetPassword, ResetPasswordEnd, Signup, TwoFactorAuthentication } from './DaikokuHomeApp';
import { AnonymousReporting } from "../components/adminbackoffice/anonymousreporting/AnonymousReporting";
import { RightPanel } from '../components/utils/sidebar/RightPanel';

const RouteWithFooterLayout = () => (
  <>
    <Outlet />
    <Footer isBackOffice={false} />
  </>
);

export const DaikokuApp = () => {
  const { connectedUser, tenant } = useContext(GlobalContext)
  const { translate } = useContext(I18nContext);

  useEffect(() => {
    if (connectedUser && !connectedUser.isGuest) {
      MessagesEvents.start();
      return () => {
        MessagesEvents.stop();
      };
    }
  }, [connectedUser]);

  if (!connectedUser) {
    return (
      <BrowserRouter>
        <ModalProvider>
          <div
            role="root-container"
            className="container-fluid"
            style={{
              minHeight: '100vh',
              position: 'relative',
              paddingBottom: '6rem',
            }}>
            <Routes>
              <Route
                path="/auth/:provider/login"
                element={
                  <UnauthenticatedRoute title={translate('Login')} header={`${translate({ key: 'login.to.tenant', replacements: [tenant.title || translate('Tenant')] })}`} >
                    <LoginPage />
                  </UnauthenticatedRoute>
                }
              />
              <Route
                path="/reset/password"
                element={
                  <UnauthenticatedRoute title={translate('Reset')} header={translate('Reset your password')}>
                    <ResetPasswordEnd />
                  </UnauthenticatedRoute>
                }
              />
              <Route
                path="/reset"
                element={
                  <UnauthenticatedRoute title={translate('Reset')} header={translate('Reset your password')}>
                    <ResetPassword />
                  </UnauthenticatedRoute>
                }
              />
              <Route
                path="/signup"
                element={
                  <UnauthenticatedRoute title={translate('Signup')} header={`${translate({ key: 'signup.to.tenant', replacements: [tenant.title || translate('Tenant')] })}`} >
                    <Signup />
                  </UnauthenticatedRoute>
                }
              />
              <Route
                path="/2fa"
                element={
                  <UnauthenticatedRoute title={translate('Verification code')} header={translate('Verification code')} >
                    <TwoFactorAuthentication />
                  </UnauthenticatedRoute>
                }
              />
              <Route
                path='/error'
                element={
                  <UnauthenticatedRoute title={translate('Error')} header={translate('Error')} >
                    <Error />
                  </UnauthenticatedRoute>
                }
              />
              <Route
                path='/response'
                element={
                  <Response />
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
                path='*'
                element={<ToLogin tenant={tenant} />}
              />
            </Routes>
          </div>
        </ModalProvider>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <MessagesProvider>
        <NavProvider>
          <ModalProvider>
            <div className="d-flex flex-row">
              <SideBar />
              <RightPanel />
              <div className="wrapper flex-grow-1 container-fluid d-flex flex-column">
                <Routes>
                  <Route
                    path='/error'
                    element={
                      <Error />
                    }
                  />
                  <Route
                    path='/response'
                    element={
                      <Response />
                    }
                  />
                  <Route
                    path="/2fa"
                    element={
                      <UnauthenticatedRoute title={translate('Verification code')} header={translate('Verification code')} >
                        <TwoFactorAuthentication />
                      </UnauthenticatedRoute>
                    }
                  />
                  <Route
                    path="/reset/password"
                    element={
                      <UnauthenticatedRoute title={translate('Reset')} header={translate('Reset your password')}>
                        <ResetPasswordEnd />
                      </UnauthenticatedRoute>
                    }
                  />
                  <Route
                    path="/reset"
                    element={
                      <UnauthenticatedRoute title={translate('Reset your password')} header={translate('Reset your password')}>
                        <ResetPassword />
                      </UnauthenticatedRoute>
                    }
                  />
                  <Route
                    path="/signup"
                    element={
                      <UnauthenticatedRoute title={translate('Signup')} header={`${translate({ key: 'signup.to.tenant', replacements: [tenant.title || translate('Tenant')] })}`} >
                        <Signup />
                      </UnauthenticatedRoute>
                    }
                  />
                  <Route
                    path="/auth/:provider/login"
                    element={
                      <LoginPage />
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
                  <Route element={<RouteWithFooterLayout />}>
                    <Route path="/apis" element={<FrontOfficeRoute title={`${tenant.title} - ${translate('Apis')}`}>
                      <MyHome />
                    </FrontOfficeRoute>} />
                    <Route path="/notifications*" element={<RouteWithTitle title={`${tenant.title} - ${translate('Notifications')}`}>
                      <NotificationList />
                    </RouteWithTitle>} />
                    <Route path="/me" element={<RouteWithTitle title={`${tenant.title} - ${translate('My profile')}`}>
                      <MyProfile />
                    </RouteWithTitle>} />
                    <Route path="/:teamId/settings*" element={<TeamBackOffice />} />
                    <Route
                      path="/join"
                      element={
                        <FrontOfficeRoute title={`${tenant.title} - ${translate('Join team')}`}>
                          <JoinTeam />
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
                    <Route
                      path='/subscriptions/_retrieve'
                      element={
                        <FrontOfficeRoute>
                          <SubscriptionRetrieve />
                        </FrontOfficeRoute>
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
                          <FastMode />
                        </RouteWithTitle>
                      }
                    />
                  </Route>
                  <Route
                    path="/atomicDesign"
                    element={
                      <RouteWithTitle title={`${tenant.title} - ${translate('Notifications')}`}>
                        <AtomicDesign />
                      </RouteWithTitle>
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
                        title={`${tenant.title} - ${translate('anonymous.reporting.title')}`}
                      >
                        <AnonymousReporting />
                      </RouteWithTitle>
                    }
                  />
                  <Route
                    path="/settings/teams/:teamSettingId/members"
                    element={
                      <RouteWithTitle title={`${tenant.title} - ${translate({ key: "Member", plural: true })}`}>
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
                </Routes>
              </div>
            </div>
          </ModalProvider>

        </NavProvider>
      </MessagesProvider>
    </BrowserRouter>
  );
};

const ToLogin = ({ tenant }) => {

  const [searchParams] = useSearchParams();

  const redirect = searchParams.get('redirect')
  const to = `/auth/${tenant.authProvider}/login`

  if (redirect)
    return <Navigate to={`${to}?redirect=${redirect}`} replace />
  else
    return <Navigate to={to} replace />
}

const FrontOfficeRoute = (props: { title?: string, children: JSX.Element }) => {
  return (
    <RouteWithTitle {...props}>
      <FrontOffice>{props.children}</FrontOffice>
    </RouteWithTitle>
  );
};

const RouteWithTitle = (props: { title?: string, children: JSX.Element }) => {
  const { tenant } = useContext(GlobalContext)

  useEffect(() => {
    if (props.title) {
      document.title = props.title;
    }
  }, [props.title]);

  return props.children;
};

const UnauthenticatedRoute = (props: { children: JSX.Element, title: string, header: string }) => {
  const { connectedUser, tenant } = useContext(GlobalContext)
  if (connectedUser && connectedUser._humanReadableId) {
    return <Navigate to="/" />;
  }

  return <RouteWithTitle title={`${tenant.title} - ${props.title}`}>
    <>
      <div className="organisation__header d-flex align-items-center justify-content-center mb-3 py-2">
        <div className="me-5">
          <img
            className="organisation__avatar"
            src={tenant.logo || '/assets/images/daikoku.svg'}
            alt="avatar"
          />
        </div>
        <h3>
          {props.header}
        </h3>
      </div>
      {props.children}
    </>
  </RouteWithTitle>;
};
