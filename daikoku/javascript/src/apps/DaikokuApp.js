import React, { Component, useEffect, useState } from 'react';
import { BrowserRouter as Router, Route, withRouter, Switch } from 'react-router-dom';
import { Redirect } from 'react-router';
import { ConnectedRouter } from 'connected-react-router';
import { connect } from 'react-redux';
import ReduxToastr from 'react-redux-toastr';

import { ModalRoot } from '../components/frontend/modals/ModalRoot';
import { TopBar, Spinner, Error, Footer } from '../components/utils';
import * as Services from '../services';
import { updateTeamPromise } from '../core';
import { history } from '../core';

import 'react-redux-toastr/src/styles/index.scss';

import {
  OrganizationChooser,
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
} from '../components/adminbackoffice';

import { smartRedirect, smartMatch } from '../services/path';
import { ResetPassword, Signup } from './DaikokuHomeApp';

class DaikokuAppComponent extends Component {
  render() {
    const { user, tenant, loginProvider, loginAction } = this.props;
    if (!user) {
      return (
        <Router>
          <div role="root-container" className="container-fluid" style={{
            minHeight: '100vh',
            position: 'relative',
            paddingBottom: '6rem'
          }}>
            <Route
              exact
              path="/"
              render={p => (
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
              render={p => (
                <UnauthenticatedHome tenant={tenant} match={p.match} history={p.history} />
              )}
            />
            <Route
              exact
              path="/"
              render={p => (
                <UnauthenticatedFooter tenant={tenant} match={p.match} history={p.history} />
              )}
            />
          </div>
        </Router>
      );
    }
    return (
      <ConnectedRouter history={history}>
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
              '/organizations',
              '/settings',
              '/consumptions',
              '/organizations',
              '/teams/:teamId/settings',
              '/:teamId/settings',
              '/teams/:teamId/apis/:apiId',
              '/:teamId/:apiId',
              '/teams/:teamId',
              '/:teamId',
              '/',
            ]}
            render={smartMatch(p => (
              <TopBar
                location={p.location}
                history={p.history}
                match={p.match}
                loginAction={loginAction}
                loginProvider={loginProvider}
              />
            ))}
          />
          <Switch>
            <UnauthenticatedRoute
              exact
              path="/reset"
              tenant={tenant}
              render={p => <ResetPassword match={p.match} history={p.history} />}
            />
            <UnauthenticatedRoute
              exact
              path="/signup"
              tenant={tenant}
              render={p => <Signup match={p.match} history={p.history} />}
            />
            <Route
              exact
              path="/notifications"
              render={p => (
                <NotificationList match={p.match} history={p.history} location={p.location} />
              )}
            />
            {/* <FrontOfficeRoute exact path="/" render={p => <MyHome match={p.match} history={p.history} />} /> */}
            <FrontOfficeRoute
              exact
              path="/apis"
              render={p => <MyHome match={p.match} history={p.history} />}
            />
            <FrontOfficeRoute
              exact
              path="/"
              render={p => <MaybeHomePage match={p.match} history={p.history} />}
            />
            <Route
              exact
              path="/settings/otoroshis/:otoroshiId"
              render={p => (
                <TenantOtoroshi match={p.match} history={p.history} location={p.location} />
              )}
            />
            <Route
              exact
              path="/settings/otoroshis"
              render={p => (
                <TenantOtoroshis match={p.match} history={p.history} location={p.location} />
              )}
            />
            <Route
              exact
              path="/settings/tenants/:tenantId"
              render={p => <TenantEdit match={p.match} history={p.history} location={p.location} />}
            />
            <Route
              exact
              path="/settings/tenants/:tenantId/style"
              render={p => (
                <TenantStyleEdit match={p.match} history={p.history} location={p.location} />
              )}
            />
            <Route
              exact
              path="/settings/tenants"
              render={p => <TenantList match={p.match} history={p.history} location={p.location} />}
            />
            <Route
              exact
              path="/settings/users/:userId"
              render={p => <UserEdit match={p.match} history={p.history} location={p.location} />}
            />
            <Route
              exact
              path="/settings/users"
              render={p => <UserList match={p.match} history={p.history} location={p.location} />}
            />
            <Route
              exact
              path="/settings/audit"
              render={p => (
                <AuditTrailList match={p.match} history={p.history} location={p.location} />
              )}
            />
            <Route
              exact
              path="/settings/sessions"
              render={p => (
                <SessionList match={p.match} history={p.history} location={p.location} />
              )}
            />
            <Route
              exact
              path="/settings/import-export"
              render={p => (
                <ImportExport match={p.match} history={p.history} location={p.location} />
              )}
            />
            <Route
              exact
              path="/settings/me"
              render={p => <MyProfile match={p.match} history={p.history} location={p.location} />}
            />
            <Route
              exact
              path="/settings/teams/:teamSettingId"
              render={p => (
                <TeamEditForAdmin match={p.match} history={p.history} location={p.location} />
              )}
            />
            <Route
              exact
              path="/settings/teams/:teamSettingId/members"
              render={p => (
                <TeamMembersForAdmin match={p.match} history={p.history} location={p.location} />
              )}
            />
            <Route
              exact
              path="/settings/teams"
              render={p => <TeamList match={p.match} history={p.history} location={p.location} />}
            />
            <Route
              exact
              path="/settings/assets"
              render={p => (
                <AssetsList
                  match={p.match}
                  history={p.history}
                  location={p.location}
                  tenantMode={true}
                />
              )}
            />
            <FrontOfficeRoute
              exact
              path="/teams"
              render={p => (
                <TeamChooser match={p.match} history={p.history} location={p.location} />
              )}
            />
            <FrontOfficeRoute
              exact
              path="/organizations"
              render={p => (
                <OrganizationChooser match={p.match} history={p.history} location={p.location} />
              )}
            />

            {/* NEW ROUTING HERE !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! */}
            {/* NEW ROUTING HERE !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! */}
            {/* NEW ROUTING HERE !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! */}

            <TeamBackOfficeRoute
              exact
              path={['/teams/:teamId/settings/edition', '/:teamId/settings/edition']}
              render={p => <TeamEdit match={p.match} history={p.history} location={p.location} />}
            />
            <TeamBackOfficeRoute
              exact
              path={['/teams/:teamId/settings/consumption', '/:teamId/settings/consumption']}
              render={smartRedirect(p => (
                <TeamConsumption match={p.match} history={p.history} location={p.location} />
              ))}
            />
            <TeamBackOfficeRoute
              exact
              path={['/teams/:teamId/settings/billing', '/:teamId/settings/billing']}
              render={smartRedirect(p => (
                <TeamBilling match={p.match} history={p.history} location={p.location} />
              ))}
            />
            <TeamBackOfficeRoute
              exact
              path={['/teams/:teamId/settings/income', '/:teamId/settings/income']}
              render={smartRedirect(p => (
                <TeamIncome match={p.match} history={p.history} location={p.location} />
              ))}
            />
            <TeamBackOfficeRoute
              exact
              path={['/teams/:teamId/settings/apikeys/:apiId', '/:teamId/settings/apikeys/:apiId']}
              render={smartRedirect(p => (
                <TeamApiKeysForApi match={p.match} history={p.history} location={p.location} />
              ))}
            />
            <TeamBackOfficeRoute
              exact
              path={[
                '/teams/:teamId/settings/apikeys/:apiId/subscription/:subscription/consumptions',
                '/:teamId/settings/apikeys/:apiId/subscription/:subscription/consumptions',
              ]}
              render={smartRedirect(p => (
                <TeamApiKeyConsumption match={p.match} history={p.history} location={p.location} />
              ))}
            />
            <TeamBackOfficeRoute
              exact
              path={['/teams/:teamId/settings/apikeys', '/:teamId/settings/apikeys']}
              render={smartRedirect(p => (
                <TeamApiKeys match={p.match} history={p.history} location={p.location} />
              ))}
            />
            <TeamBackOfficeRoute
              exact
              path={['/teams/:teamId/settings/apis', '/:teamId/settings/apis']}
              render={smartRedirect(p => (
                <TeamApis match={p.match} history={p.history} location={p.location} />
              ))}
            />

            <TeamBackOfficeRoute
              exact
              path={[
                '/teams/:teamId/settings/consumptions/apis/:apiId',
                '/:teamId/settings/consumptions/apis/:apiId',
              ]}
              render={smartRedirect(p => (
                <TeamApiConsumption match={p.match} history={p.history} location={p.location} />
              ))}
            />
            <TeamBackOfficeRoute
              exact
              path={[
                '/teams/:teamId/settings/consumptions/apis/:apiId/plan/:planId',
                '/:teamId/settings/consumptions/apis/:apiId/plan/:planId',
              ]}
              render={smartRedirect(p => (
                <TeamPlanConsumption match={p.match} history={p.history} location={p.location} />
              ))}
            />
            <TeamBackOfficeRoute
              exact
              path={['/teams/:teamId/settings/members', '/:teamId/settings/members']}
              render={smartRedirect(p => (
                <TeamMembers match={p.match} history={p.history} location={p.location} />
              ))}
            />

            <TeamBackOfficeRoute
              exact
              path={['/teams/:teamId/settings/assets', '/:teamId/settings/assets']}
              render={smartRedirect(p => (
                <AssetsList
                  match={p.match}
                  history={p.history}
                  location={p.location}
                  tenantMode={false}
                />
              ))}
            />

            <TeamBackOfficeRoute
              exact
              path={['/teams/:teamId/settings', '/:teamId/settings']}
              render={smartRedirect(p => (
                <TeamBackOfficeHome match={p.match} history={p.history} location={p.location} />
              ))}
            />

            <TeamBackOfficeRoute
              exact
              path={['/teams/:teamId/settings/apis/:apiId', '/:teamId/settings/apis/:apiId']}
              render={smartRedirect(p => (
                <TeamApi match={p.match} history={p.history} location={p.location} />
              ))}
            />
            <TeamBackOfficeRoute
              path={[
                '/teams/:teamId/settings/apis/:apiId/:tab',
                '/:teamId/settings/apis/:apiId/:tab',
              ]}
              render={smartRedirect(p => (
                <TeamApi match={p.match} history={p.history} location={p.location} />
              ))}
            />

            <FrontOfficeRoute
              exact
              path={[
                '/teams/:teamId/apis/:apiId/documentation/:pageId',
                '/:teamId/:apiId/documentation/:pageId',
              ]}
              render={smartRedirect(p => (
                <ApiHome match={p.match} history={p.history} tab="documentation-page" />
              ))}
            />
            <FrontOfficeRoute
              exact
              path={['/teams/:teamId/apis/:apiId/documentation', '/:teamId/:apiId/documentation']}
              render={smartRedirect(p => (
                <ApiHome match={p.match} history={p.history} tab="documentation" />
              ))}
            />
            <FrontOfficeRoute
              exact
              path={['/teams/:teamId/apis/:apiId/pricing', '/:teamId/:apiId/pricing']}
              render={smartRedirect(p => (
                <ApiHome match={p.match} history={p.history} tab="pricing" />
              ))}
            />
            <FrontOfficeRoute
              exact
              path={['/teams/:teamId/apis/:apiId/swagger', '/:teamId/:apiId/swagger']}
              render={smartRedirect(p => (
                <ApiHome match={p.match} history={p.history} tab="swagger" />
              ))}
            />
            <FrontOfficeRoute
              exact
              path={['/teams/:teamId/apis/:apiId/redoc', '/:teamId/:apiId/redoc']}
              render={smartRedirect(p => (
                <ApiHome match={p.match} history={p.history} tab="redoc" />
              ))}
            />
            <FrontOfficeRoute
              exact
              path={['/teams/:teamId/apis/:apiId/console', '/:teamId/:apiId/console']}
              render={smartRedirect(p => (
                <ApiHome match={p.match} history={p.history} tab="console" />
              ))}
            />

            <FrontOfficeRoute
              exact
              path={['/teams/:teamId/apis/:apiId', '/:teamId/:apiId']}
              render={smartRedirect(p => (
                <ApiHome match={p.match} history={p.history} tab="description" />
              ))}
            />

            <FrontOfficeRoute
              exact
              path={['/teams/:teamId', '/:teamId']}
              render={smartRedirect(p => (
                <TeamHome match={p.match} history={p.history} location={p.location} />
              ))}
            />
            <Route
              path="*"
              render={smartRedirect(() => (
                <Error error={{ status: 404 }} />
              ))}
            />
          </Switch>
          <Route
            path={[
              '/teams',
              '/organizations',
              '/teams/:teamId/apis/:apiId',
              '/:teamId/:apiId',
              '/teams/:teamId',
              '/:teamId',
              '/',
            ]}
            render={smartMatch(p => (
              <Footer
                isBackOffice={false}
                location={p.location}
                history={p.history}
                match={p.match}
              />
            ))}
          />
        </div>
      </ConnectedRouter>
    );
  }
}

const mapStateToProps = state => ({
  ...state.context,
  error: state.error,
});

const mapDispatchToProps = {
  updateTeam: team => updateTeamPromise(team),
};

export const DaikokuApp = connect(null)(DaikokuAppComponent);

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
          .then(team => {
            if (team.error) {
              return Promise.reject(team);
            }
            return updateTeam(team);
          })
          .then(() => setLoading(false))
          .catch(error => setTeamError(error));
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
      render={props => {
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

const FrontOfficeRoute = props => {
  return <Route {...props} render={p => <FrontOffice>{props.render(p)}</FrontOffice>} />;
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
    <Route
      {...rest}
      render={props => (
        <UnauthenticatedHome {...rest}>
          {ComponentToRender ? <ComponentToRender {...props} /> : render(props)}
        </UnauthenticatedHome>
      )}
    />
  );
};

const UnauthenticatedRoute = withRouter(connect(mapStateToProps)(UnauthenticatedRouteComponent));
