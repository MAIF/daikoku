import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Route, withRouter, Switch } from 'react-router-dom';
import { Redirect } from 'react-router';
import { ConnectedRouter } from 'connected-react-router';
import { connect } from 'react-redux';
import ReduxToastr from 'react-redux-toastr';

import { ModalRoot } from '../components/frontend/modals/ModalRoot';
import { TopBar, Spinner, Error, Footer, Discussion } from '../components/utils';
import * as Services from '../services';
import { updateTeamPromise, history } from '../core';
import { t } from '../locales';

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
} from '../components/frontend';

import {
  TeamBackOfficeHome,
  TeamApiKeys,
  TeamApiKeysForApi,
  TeamApis,
  TeamApi,
  TeamMembers,
  NotificationList,
  MyProfile,
  TeamApiKeyConsumption,
  TeamApiConsumption,
  TeamPlanConsumption,
  TeamConsumption,
  TeamBilling,
  TeamIncome,
  TeamEdit,
  AssetsList,
  TeamApiSubscriptions,
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
  AdminMessages,
} from '../components/adminbackoffice';

import { ResetPassword, Signup } from './DaikokuHomeApp';
import { MessagesEvents } from '../services/messages';

const DaikokuAppComponent = ({ user, tenant, loginProvider, loginAction, currentLanguage }) => {
  useEffect(() => {
    if (!user.isGuest) {
      MessagesEvents.start();
      return () => {
        MessagesEvents.stop();
      };
    }
  }, []);

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
          <Route
            exact
            path="/"
            render={(p) => (
              <UnauthenticatedTopBar
                tenant={tenant}
                location={p.location}
                history={p.history}
                match={p.match}
              />
            )}
          />
          <Route
            exact
            path="/"
            render={(p) => (
              <UnauthenticatedHome tenant={tenant} match={p.match} history={p.history} />
            )}
          />
          <Route
            exact
            path="/"
            render={(p) => (
              <UnauthenticatedFooter tenant={tenant} match={p.match} history={p.history} />
            )}
          />
        </div>
      </Router>
    );
  }
  return (
    <ConnectedRouter history={history}>
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
          <Route
            path={[
              '/notifications',
              '/teams',
              '/settings',
              '/consumptions',
              '/:teamId/settings',
              '/:teamId/:apiId',
              '/:teamId',
              '/',
            ]}
            render={(p) => (
              <TopBar
                location={p.location}
                history={p.history}
                match={p.match}
                loginAction={loginAction}
                loginProvider={loginProvider}
              />
            )}
          />
          <Switch>
            <UnauthenticatedRoute
              title={`${tenant.name} - ${t('Reset password', currentLanguage)}`}
              exact
              path="/reset"
              tenant={tenant}
              render={(p) => <ResetPassword match={p.match} history={p.history} />}
            />
            <UnauthenticatedRoute
              title={`${tenant.name} - ${t('Signup', currentLanguage)}`}
              exact
              path="/signup"
              tenant={tenant}
              render={(p) => <Signup match={p.match} history={p.history} />}
            />
            <RouteWithTitle
              exact
              title={`${tenant.name} - ${t('Notifications', currentLanguage)}`}
              path="/notifications"
              render={(p) => (
                <NotificationList match={p.match} history={p.history} location={p.location} />
              )}
            />

            <FrontOfficeRoute
              title={`${tenant.name} - ${t('Apis', currentLanguage)}`}
              exact
              path="/apis"
              render={(p) => <MyHome match={p.match} history={p.history} />}
            />
            <FrontOfficeRoute
              title={`${tenant.name} - ${t('Home', currentLanguage)}`}
              exact
              path="/"
              render={(p) => <MaybeHomePage match={p.match} history={p.history} />}
            />
            <RouteWithTitle
              title={`${tenant.name} - ${t('Message', currentLanguage, true)}`}
              exact
              path="/settings/messages"
              render={(p) => (
                <AdminMessages match={p.match} history={p.history} location={p.location} />
              )}
            />
            <RouteWithTitle
              title={`${tenant.name} - ${t('Otoroshi', currentLanguage)}`}
              exact
              path="/settings/otoroshis/:otoroshiId"
              render={(p) => (
                <TenantOtoroshi match={p.match} history={p.history} location={p.location} />
              )}
            />
            <RouteWithTitle
              title={`${tenant.name} - ${t('Otoroshis', currentLanguage, true)}`}
              exact
              path="/settings/otoroshis"
              render={(p) => (
                <TenantOtoroshis match={p.match} history={p.history} location={p.location} />
              )}
            />
            <RouteWithTitle
              title={`${tenant.name} - ${t('Tenant edit', currentLanguage)}`}
              exact
              path="/settings/tenants/:tenantId"
              render={(p) => (
                <TenantEdit match={p.match} history={p.history} location={p.location} />
              )}
            />
            <RouteWithTitle
              title={`${tenant.name} - ${t('Style', currentLanguage)}`}
              exact
              path="/settings/tenants/:tenantId/style"
              render={(p) => (
                <TenantStyleEdit match={p.match} history={p.history} location={p.location} />
              )}
            />
            <RouteWithTitle
              title={`${tenant.name} - ${t('Tenants', currentLanguage, true)}`}
              exact
              path="/settings/tenants"
              render={(p) => (
                <TenantList match={p.match} history={p.history} location={p.location} />
              )}
            />
            <RouteWithTitle
              title={`${tenant.name} - ${t('Admins', currentLanguage)}`}
              exact
              path="/settings/tenants/:tenantId/admins"
              render={(p) => (
                <TenantAdminList
                  match={p.match}
                  history={p.history}
                  location={p.location}
                  tenantMode={false}
                />
              )}
            />
            <RouteWithTitle
              title={`${tenant.name} - ${t('User', currentLanguage)}`}
              exact
              path="/settings/users/:userId"
              render={(p) => <UserEdit match={p.match} history={p.history} location={p.location} />}
            />
            <RouteWithTitle
              title={`${tenant.name} - ${t('Users', currentLanguage, true)}`}
              exact
              path="/settings/users"
              render={(p) => <UserList match={p.match} history={p.history} location={p.location} />}
            />
            <RouteWithTitle
              title={`${tenant.name} - ${t('Audit trail', currentLanguage)}`}
              exact
              path="/settings/audit"
              render={(p) => (
                <AuditTrailList match={p.match} history={p.history} location={p.location} />
              )}
            />
            <RouteWithTitle
              title={`${tenant.name} - ${t('User sessions', currentLanguage)}`}
              exact
              path="/settings/sessions"
              render={(p) => (
                <SessionList match={p.match} history={p.history} location={p.location} />
              )}
            />
            <RouteWithTitle
              title={`${tenant.name} - ${t('Import / Export', currentLanguage)}`}
              exact
              path="/settings/import-export"
              render={(p) => (
                <ImportExport match={p.match} history={p.history} location={p.location} />
              )}
            />
            <RouteWithTitle
              title={`${tenant.name} - ${t('My profile', currentLanguage)}`}
              exact
              path="/settings/me"
              render={(p) => (
                <MyProfile match={p.match} history={p.history} location={p.location} />
              )}
            />
            <RouteWithTitle
              title={`${tenant.name} - ${t('Team', currentLanguage)}`}
              exact
              path="/settings/teams/:teamSettingId"
              render={(p) => (
                <TeamEditForAdmin match={p.match} history={p.history} location={p.location} />
              )}
            />
            <RouteWithTitle
              title={`${tenant.name} - ${t('Team members', currentLanguage)}`}
              exact
              path="/settings/teams/:teamSettingId/members"
              render={(p) => (
                <TeamMembersForAdmin match={p.match} history={p.history} location={p.location} />
              )}
            />
            <RouteWithTitle
              title={`${tenant.name} - ${t('Teams', currentLanguage)}`}
              exact
              path="/settings/teams"
              render={(p) => <TeamList match={p.match} history={p.history} location={p.location} />}
            />
            <Route
              exact
              path="/settings/assets"
              render={(p) => (
                <AssetsList
                  match={p.match}
                  history={p.history}
                  location={p.location}
                  tenantMode={true}
                />
              )}
            />
            <RouteWithTitle
              title={`${tenant.name} - ${t('Admins', currentLanguage)}`}
              exact
              path="/settings/admins"
              render={(p) => (
                <TenantAdminList
                  match={p.match}
                  history={p.history}
                  location={p.location}
                  tenantMode={true}
                />
              )}
            />
            <RouteWithTitle
              title={`${tenant.name} - ${t('Init', currentLanguage)}`}
              exact
              path="/settings/init"
              render={(p) => (
                <InitializeFromOtoroshi match={p.match} history={p.history} location={p.location} />
              )}
            />
            {!tenant.hideTeamsPage && (
              <FrontOfficeRoute
                title={`${tenant.name} - ${t('Teams', currentLanguage)}`}
                exact
                path="/teams"
                render={(p) => (
                  <TeamChooser match={p.match} history={p.history} location={p.location} />
                )}
              />
            )}

            {/* NEW ROUTING HERE !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! */}
            {/* NEW ROUTING HERE !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! */}
            {/* NEW ROUTING HERE !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! */}

            <TeamBackOfficeRoute
              exact
              path="/:teamId/settings/edition"
              render={(p) => <TeamEdit match={p.match} history={p.history} location={p.location} />}
            />
            <TeamBackOfficeRoute
              exact
              path="/:teamId/settings/consumption"
              render={(p) => (
                <TeamConsumption match={p.match} history={p.history} location={p.location} />
              )}
            />
            <TeamBackOfficeRoute
              exact
              path="/:teamId/settings/billing"
              render={(p) => (
                <TeamBilling match={p.match} history={p.history} location={p.location} />
              )}
            />
            <TeamBackOfficeRoute
              exact
              path="/:teamId/settings/income"
              render={(p) => (
                <TeamIncome match={p.match} history={p.history} location={p.location} />
              )}
            />
            <TeamBackOfficeRoute
              exact
              path="/:teamId/settings/apikeys/:apiId"
              render={(p) => (
                <TeamApiKeysForApi match={p.match} history={p.history} location={p.location} />
              )}
            />
            <TeamBackOfficeRoute
              exact
              path="/:teamId/settings/subscriptions/apis/:apiId"
              render={(p) => (
                <TeamApiSubscriptions match={p.match} history={p.history} location={p.location} />
              )}
            />
            <TeamBackOfficeRoute
              exact
              path="/:teamId/settings/apikeys/:apiId/subscription/:subscription/consumptions"
              render={(p) => (
                <TeamApiKeyConsumption match={p.match} history={p.history} location={p.location} />
              )}
            />
            <TeamBackOfficeRoute
              exact
              path="/:teamId/settings/apikeys"
              render={(p) => (
                <TeamApiKeys match={p.match} history={p.history} location={p.location} />
              )}
            />
            <TeamBackOfficeRoute
              exact
              path="/:teamId/settings/apis"
              render={(p) => <TeamApis match={p.match} history={p.history} location={p.location} />}
            />

            <TeamBackOfficeRoute
              exact
              path="/:teamId/settings/consumptions/apis/:apiId"
              render={(p) => (
                <TeamApiConsumption match={p.match} history={p.history} location={p.location} />
              )}
            />
            <TeamBackOfficeRoute
              exact
              path="/:teamId/settings/consumptions/apis/:apiId/plan/:planId"
              render={(p) => (
                <TeamPlanConsumption match={p.match} history={p.history} location={p.location} />
              )}
            />
            <TeamBackOfficeRoute
              title={`${tenant.name} - ${t('member', currentLanguage, true)}`}
              exact
              path="/:teamId/settings/members"
              render={(p) => (
                <TeamMembers match={p.match} history={p.history} location={p.location} />
              )}
            />
            <TeamBackOfficeRoute
              exact
              path="/:teamId/settings/assets"
              render={(p) => (
                <AssetsList
                  match={p.match}
                  history={p.history}
                  location={p.location}
                  tenantMode={false}
                />
              )}
            />
            <TeamBackOfficeRoute
              exact
              path="/:teamId/settings"
              render={(p) => (
                <TeamBackOfficeHome match={p.match} history={p.history} location={p.location} />
              )}
            />
            <TeamBackOfficeRoute
              exact
              path="/:teamId/settings/apis/:apiId"
              render={(p) => <TeamApi match={p.match} history={p.history} location={p.location} />}
            />
            <TeamBackOfficeRoute
              title={`${tenant.name} - ${t('API', currentLanguage)}`}
              path="/:teamId/settings/apis/:apiId/:tab"
              render={(p) => <TeamApi match={p.match} history={p.history} location={p.location} />}
            />

            <FrontOfficeRoute
              exact
              path="/:teamId/:apiId/documentation/:pageId"
              render={(p) => (
                <ApiHome match={p.match} history={p.history} tab="documentation-page" />
              )}
            />
            <FrontOfficeRoute
              exact
              path="/:teamId/:apiId/documentation"
              render={(p) => <ApiHome match={p.match} history={p.history} tab="documentation" />}
            />
            <FrontOfficeRoute
              exact
              path="/:teamId/:apiId/pricing"
              render={(p) => <ApiHome match={p.match} history={p.history} tab="pricing" />}
            />
            <FrontOfficeRoute
              exact
              path="/:teamId/:apiId/swagger"
              render={(p) => <ApiHome match={p.match} history={p.history} tab="swagger" />}
            />
            <FrontOfficeRoute
              exact
              path="/:teamId/:apiId/redoc"
              render={(p) => <ApiHome match={p.match} history={p.history} tab="redoc" />}
            />
            <FrontOfficeRoute
              exact
              path="/:teamId/:apiId/console"
              render={(p) => <ApiHome match={p.match} history={p.history} tab="console" />}
            />
            <FrontOfficeRoute
              exact
              path="/:teamId/:apiId"
              render={(p) => <ApiHome match={p.match} history={p.history} tab="description" />}
            />
            <FrontOfficeRoute
              exact
              path="/:teamId/:apiId/posts"
              render={(p) => <ApiHome match={p.match} history={p.history} tab="posts" />}
            />

            <FrontOfficeRoute
              exact
              path="/:teamId"
              render={(p) => <TeamHome match={p.match} history={p.history} location={p.location} />}
            />
            <RouteWithTitle
              title={`${tenant.name} - ${t('404 Error', currentLanguage)}`}
              path="*"
              render={() => <Error error={{ status: 404 }} />}
            />
          </Switch>
          <Route
            path="/"
            render={(p) => <Discussion location={p.location} history={p.history} match={p.match} />}
          />
          <Switch>
            <Route
              path={['/settings', '/notifications', '/:teamId/settings']}
              render={() => null}
            />
            <Route
              path={['/']}
              render={(p) => (
                <Footer
                  isBackOffice={false}
                  location={p.location}
                  history={p.history}
                  match={p.match}
                />
              )}
            />
          </Switch>
        </div>
      </MessagesProvider>
    </ConnectedRouter>
  );
};

const mapStateToProps = (state) => ({
  ...state.context,
  error: state.error,
});

const mapDispatchToProps = {
  updateTeam: (team) => updateTeamPromise(team),
};

export const DaikokuApp = connect(mapStateToProps)(DaikokuAppComponent);

//custom component route to get team object if it's not present in  redux store...

const TeamBackOfficeRouteComponent = ({
  component: ComponentToRender,
  render,
  currentTeam,
  updateTeam,
  ...rest
}) => {
  const [loading, setLoading] = useState(false);
  const [match, setMatch] = useState();
  const [noRender, setNoRender] = useState(false);
  const [teamError, setTeamError] = useState(null);

  useEffect(() => {
    if (loading && match && rest.path.includes(match.path)) {
      if (match.params.teamId !== 'settings') {
        Services.oneOfMyTeam(match.params.teamId)
          .then((team) => {
            if (team.error) {
              return Promise.reject(team);
            }
            return updateTeam(team);
          })
          .then(() => setLoading(false))
          .catch((error) => setTeamError(error));
      } else {
        setNoRender(true);
      }
    }
  }, [loading]);

  useEffect(() => {
    if (teamError) {
      setLoading(false);
    }
  }, [teamError]);

  if (noRender) {
    return null;
  }

  return (
    <Route
      {...rest}
      render={(props) => {
        //todo: if error => show error page
        if (loading) {
          return <Spinner />;
        } else if (teamError) {
          return <Error error={{ status: 404 }} />;
        } else if (!currentTeam || props.match.params.teamId !== currentTeam._humanReadableId) {
          setLoading(true);
          setMatch(props.match);
        } else {
          return ComponentToRender ? <ComponentToRender {...props} /> : render(props);
        }
      }}
    />
  );
};

const TeamBackOfficeRoute = withRouter(
  connect(mapStateToProps, mapDispatchToProps)(TeamBackOfficeRouteComponent)
);

const FrontOfficeRoute = (props) => {
  return <RouteWithTitle {...props} render={(p) => <FrontOffice>{props.render(p)}</FrontOffice>} />;
};

const RouteWithTitle = (props) => {
  useEffect(() => {
    if (props.title) {
      document.title = props.title;
    }
  }, [props.title]);

  return <Route {...props} />;
};

const UnauthenticatedRouteComponent = ({
  component: ComponentToRender,
  render,
  connectedUser,
  ...rest
}) => {
  if (connectedUser._humanReadableId) {
    return <Redirect to="/" />;
  }
  return (
    <RouteWithTitle
      {...rest}
      render={(props) => (
        <UnauthenticatedHome {...rest}>
          {ComponentToRender ? <ComponentToRender {...props} /> : render(props)}
        </UnauthenticatedHome>
      )}
    />
  );
};

const UnauthenticatedRoute = withRouter(connect(mapStateToProps)(UnauthenticatedRouteComponent));
