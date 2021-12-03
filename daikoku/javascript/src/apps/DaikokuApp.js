import React, { useContext, useEffect, useState } from 'react';
import { BrowserRouter, BrowserRouter as Router, Route, Routes, useParams } from 'react-router-dom';
import { Navigate } from 'react-router';
import { connect, useDispatch, useSelector } from 'react-redux';
import ReduxToastr from 'react-redux-toastr';

import { ModalRoot } from '../components/frontend/modals/ModalRoot';
import { TopBar, Spinner, Error, Footer, Discussion } from '../components/utils';
import * as Services from '../services';
import { updateTeamPromise, history } from '../core';
import { TeamBackOffice } from '../components/backoffice/TeamBackOffice'

import 'react-redux-toastr/src/styles/index.scss';

import {
  TeamChooser,
  TeamHome,
  MyHome,
  MaybeHomePage,
  ApiHome,
  UnauthenticatedHome,
  UnauthenticatedTopBar,
  UnauthenticatedFooter,
  FrontOffice,
  JoinTeam,
} from '../components/frontend';

import {
  NotificationList,
  MyProfile,
  AssetsList,
  MessagesProvider,
} from '../components/backoffice';

import {
  TenantOtoroshi,
  TenantOtoroshis,
  TenantList,
  TenantEdit,
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
  InitializeFromOtoroshi,
  MailingInternalization,
  AdminMessages,
} from '../components/adminbackoffice';

import { ResetPassword, Signup, TwoFactorAuthentication } from './DaikokuHomeApp';
import { MessagesEvents } from '../services/messages';
import { I18nContext } from '../locales/i18n-context';

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
          }}>
          <Routes>
            <Route
              path="/"
              element={<>
                <UnauthenticatedTopBar tenant={tenant} />
                <UnauthenticatedHome tenant={tenant} />
                <UnauthenticatedFooter tenant={tenant} />
              </>}
            />
          </Routes>
        </div>
      </Router>
    );
  }
  return (
    <BrowserRouter history={history}>
      <MessagesProvider>
        <div role="root-container" className="container-fluid main-content-container">
          <ModalRoot />
          <ReduxToastr
            timeOut={4000}
            newestOnTop={false}
            position="top-right"
            transitionIn="fadeIn"
            transitionOut="fadeOut"
            closeOnToastrClick
          />
          <TopBar
            loginAction={loginAction}
            loginProvider={loginProvider}
          />
          <Routes>
            <Route
              path="/2fa"
              element={
                <UnauthenticatedRoute title={`${tenant.name} - ${translateMethod('Verification code')}`} tenant={tenant}>
                  <TwoFactorAuthentication title={`${tenant.name} - ${translateMethod('Verification code')}`} />
                </UnauthenticatedRoute>
              }
            />
            <Route
              path="/reset"
              element={
                <UnauthenticatedRoute title={`${tenant.name} - ${translateMethod('Reset password')}`} tenant={tenant}>
                  <ResetPassword />
                </UnauthenticatedRoute>
              }
            />
            <Route
              path="/signup"
              element={<UnauthenticatedRoute title={`${tenant.name} - ${translateMethod('Signup')}`} tenant={tenant}>
                <Signup />
              </UnauthenticatedRoute>}
            />
            <Route
              path="/notifications"
              element={
                <RouteWithTitle title={`${tenant.name} - ${translateMethod('Notifications')}`}>
                  <NotificationList />
                </RouteWithTitle>
              }
            />
            <Route
              path="/join"
              element={<FrontOfficeRoute title={`${tenant.name} - ${translateMethod('Join team')}`}>
                <JoinTeam />
              </FrontOfficeRoute>}
            />
            <Route
              path="/apis"
              element={<FrontOfficeRoute title={`${tenant.name} - ${translateMethod('Apis')}`}>
                <MyHome />
              </FrontOfficeRoute>}
            />
            <Route
              path="/"
              element={
                <FrontOfficeRoute
                  title={`${tenant.name} - ${translateMethod('Home')}`}>
                  <MaybeHomePage tenant={tenant} />
                </FrontOfficeRoute>
              }
            />
            <Route
              path="/settings/messages"
              element={
                <RouteWithTitle title={`${tenant.name} - ${translateMethod('Message', true)}`}>
                  <AdminMessages />
                </RouteWithTitle>
              }
            />
            <Route
              path="/settings/otoroshis/:otoroshiId"
              element={
                <RouteWithTitle title={`${tenant.name} - ${translateMethod('Otoroshi')}`}>
                  <TenantOtoroshi />
                </RouteWithTitle>
              }
            />
            <Route
              path="/settings/otoroshis"
              element={
                <RouteWithTitle title={`${tenant.name} - ${translateMethod('Otoroshis', true)}`}>
                  <TenantOtoroshis />
                </RouteWithTitle>
              }
            />
            <Route
              path="/settings/tenants/:tenantId"
              element={
                <RouteWithTitle title={`${tenant.name} - ${translateMethod('Tenant edit')}`}>
                  <TenantEdit />
                </RouteWithTitle>
              }
            />
            <Route
              path="/settings/tenants/:tenantId/style"
              element={
                <RouteWithTitle title={`${tenant.name} - ${translateMethod('Style')}`}>
                  <TenantStyleEdit />
                </RouteWithTitle>
              }
            />
            <Route
              path="/settings/tenants"
              element={
                <RouteWithTitle title={`${tenant.name} - ${translateMethod('Tenants', true)}`}>
                  <TenantList />
                </RouteWithTitle>
              }
            />
            <Route
              path="/settings/tenants/:tenantId/admins"
              element={
                <RouteWithTitle title={`${tenant.name} - ${translateMethod('Admins')}`}>
                  <TenantAdminList tenantMode={false} />
                </RouteWithTitle>
              }
            />
            <Route
              path="/settings/users/:userId"
              element={<RouteWithTitle title={`${tenant.name} - ${translateMethod('User')}`}>
                <UserEdit />
              </RouteWithTitle>}
            />
            <Route
              path="/settings/users"
              element={<RouteWithTitle title={`${tenant.name} - ${translateMethod('Users', true)}`}>
                <UserList />
              </RouteWithTitle>}
            />
            <Route
              path="/settings/audit"
              element={
                <RouteWithTitle title={`${tenant.name} - ${translateMethod('Audit trail')}`}>
                  <AuditTrailList />
                </RouteWithTitle>
              }
            />
            <Route
              path="/settings/sessions"
              element={
                <RouteWithTitle title={`${tenant.name} - ${translateMethod('User sessions')}`}>
                  <SessionList />
                </RouteWithTitle>
              }
            />
            <Route
              path="/settings/import-export"
              element={
                <RouteWithTitle title={`${tenant.name} - ${translateMethod('Import / Export')}`}>
                  <ImportExport />
                </RouteWithTitle>
              }
            />
            <Route
              path="/settings/me"
              element={
                <RouteWithTitle title={`${tenant.name} - ${translateMethod('My profile')}`}>
                  <MyProfile />
                </RouteWithTitle>
              }
            />
            <Route
              path="/settings/teams/:teamSettingId"
              element={
                <RouteWithTitle title={`${tenant.name} - ${translateMethod('Team')}`}>
                  <TeamEditForAdmin />
                </RouteWithTitle>
              }
            />
            <Route
              path="/settings/teams/:teamSettingId/members"
              element={
                <RouteWithTitle title={`${tenant.name} - ${translateMethod('Team members')}`}>
                  <TeamMembersForAdmin />
                </RouteWithTitle>
              }
            />
            <Route
              path="/settings/teams"
              element={<RouteWithTitle title={`${tenant.name} - ${translateMethod('Teams')}`}>
                <TeamList />
              </RouteWithTitle>}
            />
            <Route
              path="/settings/assets"
              element={<AssetsList tenantMode={true} />}
            />
            <Route
              path="/settings/admins"
              element={
                <RouteWithTitle title={`${tenant.name} - ${translateMethod('Admins')}`}>
                  <TenantAdminList tenantMode={true} />
                </RouteWithTitle>
              }
            />
            <Route
              path="/settings/init"
              element={
                <RouteWithTitle title={`${tenant.name} - ${translateMethod('Init')}`}>
                  <InitializeFromOtoroshi />
                </RouteWithTitle>
              }
            />
            {['/settings/internationalization', '/settings/internationalization/:domain'].map(r =>
              <Route
                key={r}
                path={r}
                element={
                  <RouteWithTitle title={`${tenant.name} - ${translateMethod('Internalization')}`}>
                    <MailingInternalization tenant={tenant} />
                  </RouteWithTitle>
                }
              />
            )}
            {!tenant.hideTeamsPage && (
              <Route
                path="/teams"
                element={
                  <FrontOfficeRoute title={`${tenant.name} - ${translateMethod('Teams')}`}>
                    <TeamChooser />
                  </FrontOfficeRoute>
                }
              />
            )}

            <Route
              path="/:teamId/settings/*"
              element={<TeamBackOfficeRouter tenant={tenant} />}
            />

            <Route
              path="/:teamId/:apiId/:versionId/documentation/:pageId"
              element={
                <FrontOfficeRoute>
                  <ApiHome tab="documentation-page" />
                </FrontOfficeRoute>
              }
            />
            <Route
              path="/:teamId/:apiId/:versionId/documentation"
              element={<FrontOfficeRoute>
                <ApiHome tab="documentation" />
              </FrontOfficeRoute>}
            />
            <Route
              path="/:teamId/:apiId/:versionId/pricing"
              element={<FrontOfficeRoute>
                <ApiHome tab="pricing" />
              </FrontOfficeRoute>}
            />
            <Route
              path="/:teamId/:apiId/:versionId/swagger"
              element={<FrontOfficeRoute>
                <ApiHome tab="swagger" />
              </FrontOfficeRoute>}
            />
            <Route
              path="/:teamId/:apiId/:versionId/redoc"
              element={<FrontOfficeRoute>
                <ApiHome tab="redoc" />
              </FrontOfficeRoute>}
            />
            <Route
              path="/:teamId/:apiId/:versionId/console"
              element={<FrontOfficeRoute>
                <ApiHome tab="console" />
              </FrontOfficeRoute>}
            />
            {['/:teamId/:apiId/:versionId', '/:teamId/:apiId/:versionId/description'].map(r => (
              <Route
                key={r}
                path={r}
                element={<FrontOfficeRoute>
                  <ApiHome tab="description" />
                </FrontOfficeRoute>}
              />
            ))}
            <Route
              path="/:teamId/:apiId/:versionId/news"
              element={<FrontOfficeRoute>
                <ApiHome tab="news" />
              </FrontOfficeRoute>}
            />
            {['/:teamId/:apiId/:versionId/labels', '/:teamId/:apiId/:versionId/issues'].map(r =>
              <Route
                key={r}
                path={r}
                element={<FrontOfficeRoute>
                  <ApiHome tab="issues" />
                </FrontOfficeRoute>}
              />
            )}
            <Route
              path="/:teamId"
              element={<FrontOfficeRoute>
                <TeamHome />
              </FrontOfficeRoute>}
            />
          </Routes>
          <Routes>
            <Route
              path="*"
              element={<RouteWithTitle title={`${tenant.name} - ${translateMethod('404 Error')}`}>
                <Error error={{ status: 404 }} />
              </RouteWithTitle>}
            />
          </Routes>
          <Routes>
            <Route
              path="/"
              element={<Discussion />}
            />
          </Routes>
          <Routes>
            <Route
              path='/'
              element={<Footer isBackOffice={false} />}
            />
          </Routes>
        </div>
      </MessagesProvider>
    </BrowserRouter >
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
  const [teamError, setTeamError] = useState();

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentTeam || params.teamId !== currentTeam._humanReadableId) {
      setLoading(true);
      getMyTeam();
    } else setLoading(false);
  }, [params.teamId]);

  function getMyTeam() {
    Services.oneOfMyTeam(params.teamId).then((team) => {
      if (team.error) setTeamError(team.error);
      else dispatch(updateTeamPromise(team));
      setLoading(false);
    });
  }

  if (teamError) return <Error error={{ status: 404 }} />;

  if (!currentTeam || loading) return <Spinner />;
  else
    return <TeamBackOffice currentTeam={currentTeam} tenant={tenant} />
};

const FrontOfficeRoute = (props) => {
  return <RouteWithTitle {...props}>
    <FrontOffice>{props.children}</FrontOffice>
  </RouteWithTitle>;
};

const RouteWithTitle = (props) => {
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
}) => {

  if (connectedUser._humanReadableId) {
    return <Navigate to="/" />;
  }

  return (
    <RouteWithTitle title={title}>
      <UnauthenticatedHome title={title}>
        {children}
      </UnauthenticatedHome>
    </RouteWithTitle>
  );
};

const UnauthenticatedRoute = connect(mapStateToProps)(UnauthenticatedRouteComponent);
